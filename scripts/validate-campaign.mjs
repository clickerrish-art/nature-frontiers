import { readFile } from "node:fs/promises";

const products = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));
const campaigns = JSON.parse(await readFile(new URL("../data/campaigns.json", import.meta.url), "utf8"));
const errors = [];
const warnings = [];

if (!Array.isArray(products) || products.length === 0) {
  errors.push("Catalogue must be a non-empty array.");
} else {
  const ids = new Set();
  for (const [index, product] of products.entries()) {
    const label = product?.id || `item ${index + 1}`;
    for (const field of ["id", "title", "price", "url", "promotion_angle", "status"]) {
      if (typeof product?.[field] !== "string" || !product[field].trim()) {
        errors.push(`${label}: missing required field "${field}".`);
      }
    }
    if (product?.id && ids.has(product.id)) errors.push(`Duplicate product id: ${product.id}`);
    if (product?.id) ids.add(product.id);

    try {
      const url = new URL(product.url);
      if (url.protocol !== "https:" || url.hostname !== "selar.com" || product.url !== url.href) {
        errors.push(`${label}: URL must be a canonical HTTPS Selar checkout link.`);
      }
    } catch {
      errors.push(`${label}: invalid URL.`);
    }

    if (product?.status !== "review-required" && product?.status !== "approved") {
      errors.push(`${label}: unsupported product status "${product?.status}".`);
    }
    if (product?.status !== "approved") {
      warnings.push(`${label}: product remains review-required; it cannot be published.`);
    }

    const text = `${product?.title ?? ""} ${product?.promotion_angle ?? ""}`.toLowerCase();
    const claimText = text.replace(
      /\b(?:do not|don't|never|without)\b[^.!?]{0,120}\b(?:guarantee(?:d)?|promise(?:d)?|claim(?:ed)?)\b[^.!?]{0,80}[.!?]?/gi,
      ""
    );
    if (/guaranteed income|guaranteed earnings|make money fast|risk[- ]free income/.test(claimText)) {
      errors.push(`${label}: contains a prohibited guaranteed-income style claim.`);
    }
  }

  const urls = new Map();
  for (const product of products) {
    if (!product?.url) continue;
    const previous = urls.get(product.url);
    if (previous) {
      warnings.push(`Shared checkout URL used by "${previous}" and "${product.id}". Human verification is required before approval.`);
    } else {
      urls.set(product.url, product.id);
    }
  }
}

if (!Array.isArray(campaigns)) {
  errors.push("Campaign queue must be a JSON array.");
} else {
  const campaignIds = new Set();
  for (const [index, campaign] of campaigns.entries()) {
    const label = campaign?.id || `campaign ${index + 1}`;
    if (typeof campaign?.id !== "string" || !campaign.id.trim()) errors.push(`${label}: missing stable campaign id.`);
    if (campaign?.id && campaignIds.has(campaign.id)) errors.push(`Duplicate campaign id: ${campaign.id}`);
    if (campaign?.id) campaignIds.add(campaign.id);

    if (campaign?.network !== "facebook") warnings.push(`${label}: network is not facebook; this validator only checks Facebook campaigns.`);
    if (!["draft", "approved", "publishing", "published"].includes(campaign?.status)) {
      errors.push(`${label}: unsupported campaign status "${campaign?.status}".`);
    }
    const product = products.find((item) => item.id === campaign?.product_id);
    if (!product) {
      errors.push(`${label}: references unknown product "${campaign?.product_id}".`);
      continue;
    }
    if (typeof campaign?.caption !== "string" || !campaign.caption.trim()) {
      errors.push(`${label}: caption is missing.`);
    } else if (!campaign.caption.includes(product.url)) {
      errors.push(`${label}: caption URL does not match the current catalogue URL for "${product.id}".`);
    }
    if (typeof campaign?.caption === "string" && !campaign.caption.includes("Disclosure: This is a promotional post for a paid digital product.")) {
      errors.push(`${label}: caption must include a clear paid-product promotional disclosure.`);
    }
    if (campaign?.status === "approved") {
      if (campaign.link_verified !== true) errors.push(`${label}: cannot be approved without human-confirmed link_verified=true.`);
      if (product.status !== "approved") errors.push(`${label}: approved campaign's product "${product.id}" is not approved.`);
      if (campaign.review_note?.toLowerCase().includes("hold")) errors.push(`${label}: review note indicates a hold; resolve it before approval.`);
    } else if (campaign?.status === "draft") {
      warnings.push(`${label}: remains a draft and will not be published.`);
    }
  }
}

if (warnings.length) {
  console.log("Review warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}
if (errors.length) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Catalogue and campaign validation passed: ${products.length} products, ${campaigns.length} campaigns.`);
console.log("This validator does not publish content; live publishing remains separately gated.");
