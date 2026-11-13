# Meta API proactive operations and release controls

Status: implementation plan and owner operating controls; not evidence of a deployed service. The daily version monitor is deliberately read-only and never changes the pinned production version.

## Non-negotiable safety boundary

- Nature Frontiers is Facebook/Instagram only. Never route it to YouTube.
- No automated comments, replies, Messenger/Instagram DMs, views, likes, follows, or engagement manipulation.
- Publishing remains disabled, dry-run remains enabled, and the emergency stop remains active until every release gate is independently evidenced.
- No production Page writes are permitted from development/test apps or CI test jobs.
- No automatic retry after an ambiguous publish result. Inspect the Page and reconcile the remote object before any manual recovery.
- Rights, provenance, human approval, originality, AI disclosure, and platform policy are per-asset/per-post release gates.

## Token lifecycle: correct token-specific behaviour

A fixed 30-day maintenance cadence is a check/refresh target, not a guarantee that all Meta tokens expire after 60 days.

1. Facebook long-lived User tokens may be exchanged while still valid using Meta's documented OAuth token-exchange flow. The exchange requires the app ID, app secret and current User token, and the replacement must be persisted atomically in a secure secret manager.
2. A Page access token obtained for Page management is not interchangeable with a User token. Do not blindly exchange a Page token as though it were a 60-day User token. Inspect it with Graph API `/{version}/debug_token`, check `is_valid`, `expires_at`, `data_access_expires_at`, app ID, user ID, scopes and granular scopes.
3. If a User token is still valid and the secret manager is configured, an unattended exchange may be performed on day 30. Verify the returned token with `debug_token`, verify the expected app/user/scopes, then atomically replace the secret. Never log the token.
4. If token is expired, invalid, revoked, missing permissions, wrong app/user, or cannot be safely persisted, open the circuit breaker, disable publishing, and alert the owner for Facebook Login / re-authorisation. No system can silently re-authenticate a human after consent is revoked or a login challenge is required.
5. Monitor the Page token independently. A Page token can be invalidated before an expected expiry by access removal, security events, app changes or Page/Business permission changes. Do not promise it will never lapse.

Required future secret-store contract: encrypted at rest; access restricted to a dedicated service identity; atomic versioned writes; rotation history; no plaintext in CI outputs, artifacts, logs, issues or chat; rollback only to a still-valid, verified prior version. The current repository has no authorised secret-store write integration, so unattended token rotation is NOT configured.

## Graph API version lifecycle

- Pin an explicitly tested Graph API version; never use an unversioned URL.
- Daily monitor the official Meta Graph API documentation and changelog. Compare the latest published version with the pinned production version and its announced retirement date.
- Open a maintenance issue and alert the owner when a new version appears, a version is within 180 days of retirement, or the official source cannot be read.
- Do not automatically bump production versions. Create a development-app test branch, run contract/regression tests, obtain owner approval, then update the pin.
- Current official documentation lists v27.0 and guarantees each version for at least two years; verify this at every monitor run.

## Circuit breaker and error policy

Immediately pause all Meta mutations for the affected app/Page and require human review for:
- Graph error codes 4 and 17, HTTP 429, usage headers indicating throttling, and relevant Page/Instagram rate-limit codes such as 80001/80002.
- Error code 368 (abusive/disallowed action), spam/integrity flags, blocks, checkpoints or account restrictions.
- Codes 3, 6 and 8 as explicitly configured hard-stop signals; treat unknown permission/authentication errors as hard stops too.
- OAuth code 190, permission code 200, app access loss, wrong Page/app identity, webhook signature failure, or repeated server errors beyond the bounded retry budget.

On a circuit-breaker event:
1. Persist `publishing_enabled=false` / open circuit state before another write can run.
2. Do not retry the triggering mutation. Do not rotate IPs, proxy, VPN, accounts or tokens to evade enforcement.
3. Capture HTTP status, Meta error code/subcode/type, fbtrace_id, request ID, endpoint, API version, app/Page identifiers, response headers relevant to usage, timestamp and correlation ID.
4. Notify the owner with the exact action needed. Resume only after a human confirms account health and the underlying cause is resolved.
5. For safe transient 5xx failures only, use bounded exponential backoff with jitter and a small retry budget; never retry an ambiguous publication or a policy/rate-limit/abuse error.

## Audit logging and privacy

Record every API attempt: UTC timestamp, correlation ID, method, endpoint path, pinned version, app/Page IDs, action class, response status, Meta error code/subcode, fbtrace_id, latency, retry decision, circuit state, and redacted request/response payload plus SHA-256 digest. Never record access tokens, app secrets, authorization headers, cookies, full personal messages, or unnecessary personal data. Restrict log access, encrypt at rest, set retention and deletion rules, and alert on tampering or missing audit events.

## Pre-publish content hygiene

Block a post unless every check passes:
- Unique caption and media hashes against owned publication history and the current queue; no automated third-party clip/news reposting.
- Verified original creator/source, chain of title, written commercial rights, releases, allowed edits, platforms, territory, term and attribution.
- Human approval bound to exact caption, media hashes, destination Page/account, scheduled window, paid-promotion disclosure and AI-media disclosure.
- AI-generated/meaningfully altered realistic media is labelled truthfully and the applicable native Meta disclosure control is used. Never invent undocumented payload fields; verify the current endpoint schema and read-back.
- Scan audio against a licensed music inventory; block copyrighted/unlicensed audio.
- Inspect source metadata and rendered output for TikTok, CapCut, template or other third-party watermarks. Reject watermarked assets. Never strip a third-party watermark to conceal provenance or evade platform rules.
- Validate metadata, dimensions, duration, caption length, link status, redirect destination, banned/unsafe claims and brand/platform destination.
- Check banned keyword rules as a configurable policy list with human review for false positives; do not rely on keyword filtering alone.
- Duplicate captions, broken links, missing disclosures, rights uncertainty, watermark detections, originality uncertainty or policy warnings are HOLD.

## Pacing and organic behaviour

No exact-timestamp repetitive bot cadence. A future scheduler must enforce owner-approved daily caps per Page, per-format caps, quiet hours, minimum intervals, timezone/DST correctness, jitter within approved windows, deduplication and a manual pause. No scheduler may create comments, DMs, views, likes, follows or engagement.

## Test isolation

Use a separate Meta development app, Meta test users/test assets and (where available) a test Page. Development CI must never receive production Page credentials. Contract tests use mocks/fixtures; integration tests use only the development app and test assets. A production smoke test must be read-only unless the owner separately authorizes a single exact operation.

## Business Manager and infrastructure

Owner must verify that the Page, Instagram professional account, app/business portfolio, relevant ad account (if any), system users and assigned people/partners are owned/managed by the intended verified Meta Business Portfolio, with least privilege and 2FA. The repository currently has no evidence of this ownership/assignment state.

A dedicated cloud host and static egress IP require a provisioned hosting account, DNS/TLS, firewall, patching, backups, monitoring and an approved budget. Do not use rotating residential proxies or shared VPNs. No server or static IP is provisioned by this repository change. Hosting choice and account authorization are owner gates.

## Weekly owner health review (10–15 minutes)

1. Open Meta Business Suite/Page Quality and Account Status; inspect restrictions, recommendation eligibility, monetization status, policy notices and support inbox.
2. Check comments and inbox manually; respond as a human, consistent with Page policy. No automated replies or DMs.
3. Review recent published posts, originality, rights/disclosures, reach anomalies and any removed/rejected content.
4. Confirm Business Portfolio people, partners, Page/Instagram assets, app roles and 2FA; remove unknown access.
5. Review API circuit-breaker alerts, token status, app permissions, webhook delivery failures, API usage headers and version-monitor alerts.
6. Record reviewer, date, findings, evidence links and remediation owner. Any restriction, integrity warning, unexplained drop or token anomaly remains HOLD.

## Current deployment status

This repository change can add monitoring and owner procedures, but it does not provision a host/static IP, secret manager, Meta Business Portfolio configuration, OAuth callback, webhook endpoint, or Meta App Review. Those remain blocked until owner-authorized infrastructure and Meta developer access exist. Do not describe this runbook or a green CI check as a production deployment.
