const ALLOWED_ROLES = new Set([
  "editor", "rights_reviewer", "provenance_reviewer",
  "editorial_reviewer", "owner_approver", "publishing_operator"
]);

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_base64url");
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function configuredIdentityRoles(env) {
  if (typeof env.CF_ACCESS_TEAM_DOMAIN !== "string" ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(env.CF_ACCESS_TEAM_DOMAIN) ||
      typeof env.CF_ACCESS_AUD !== "string" || !env.CF_ACCESS_AUD.trim()) return null;
  let mapping;
  try { mapping = JSON.parse(env.PUBLISHER_ACCESS_IDENTITY_ROLES_JSON || ""); }
  catch { return null; }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
  const entries = Object.entries(mapping);
  if (!entries.length || entries.some(([email, role]) =>
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof role !== "string" || !ALLOWED_ROLES.has(role))) return null;
  const normalizedMapping = Object.create(null);
  for (const [email, role] of entries) {
    const normalizedEmail = email.trim().toLowerCase();
    if (Object.hasOwn(normalizedMapping, normalizedEmail)) return null;
    normalizedMapping[normalizedEmail] = role;
  }
  return { issuer: "https://" + env.CF_ACCESS_TEAM_DOMAIN.replace(/\/$/, ""), audience: env.CF_ACCESS_AUD, mapping: normalizedMapping };
}

export async function verifyCloudflareAccessIdentity(request, env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const config = configuredIdentityRoles(env);
  if (!config) return { ok: false, error: "cloudflare_access_auth_not_configured", status: 503 };
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { ok: false, error: "unauthorized", status: 401 };
  const token = authorization.slice(7);
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) return { ok: false, error: "unauthorized", status: 401 };

  try {
    const header = decodeJsonPart(segments[0]);
    const claims = decodeJsonPart(segments[1]);
    if (!header || header.alg !== "RS256" || typeof header.kid !== "string" ||
        !claims || claims.iss !== config.issuer || typeof claims.sub !== "string" || !claims.sub ||
        !Number.isFinite(claims.exp) || claims.exp <= nowSeconds ||
        (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > nowSeconds)) ||
        (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + 60))) {
      return { ok: false, error: "unauthorized", status: 401 };
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(config.audience)) return { ok: false, error: "unauthorized", status: 401 };
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const role = config.mapping[email];
    if (!email || !ALLOWED_ROLES.has(role)) return { ok: false, error: "forbidden", status: 403 };

    const response = await fetch(config.issuer + "/cdn-cgi/access/certs", {
      method: "GET", headers: { Accept: "application/json" }, redirect: "error"
    });
    if (!response.ok) return { ok: false, error: "identity_verification_unavailable", status: 503 };
    const jwks = await response.json();
    const jwk = Array.isArray(jwks?.keys) ? jwks.keys.find((key) => key?.kid === header.kid && key?.kty === "RSA" && (!key.alg || key.alg === "RS256") && key?.use === "sig") : null;
    if (!jwk) return { ok: false, error: "unauthorized", status: 401 };
    const publicKey = await crypto.subtle.importKey("jwk", jwk, {
      name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"
    }, false, ["verify"]);
    const signature = decodeBase64Url(segments[2]);
    const signedData = new TextEncoder().encode(segments[0] + "." + segments[1]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
    if (!valid) return { ok: false, error: "unauthorized", status: 401 };
    return { ok: true, identity: { role, actor: email } };
  } catch {
    return { ok: false, error: "unauthorized", status: 401 };
  }
}
