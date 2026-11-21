# Meta proactive operations and release controls

**Status:** code and CI controls are present in this branch; production Meta connectivity and webhook deployment are not yet verified.

## Brand and publishing boundary

- Nature Frontiers publishes to its Facebook Page and linked Instagram professional account only. It is not a SonicVhibez YouTube destination.
- Public publishing is disabled by default; dry-run defaults to true.
- Every workflow dispatch selects exactly one operation (facebook_video, facebook_reel, or instagram_reel) and one exact campaign ID. The live authorization flag alone is insufficient.
- No automated comments, replies, DMs, likes, follows, views or engagement manipulation.
- No automatic retry after an ambiguous publication result. Reconcile the remote platform object and durable campaign state first.

## Content and rights

- Properly licensed stock footage is permitted with the original source URL, creator, exact licence and licence evidence, named/timestamped provenance review, verified exact media SHA-256, watermark scan, explicit audio status/licence, animal-welfare and non-graphic review, and visible on-screen stock disclosure.
- Original camera recordings remain permitted with retained source file, original-file hash and human provenance review.
- Synthetic/AI-generated wildlife footage is prohibited for documentary wildlife claims.
- Editorial wildlife posts do not require YouTube, product-catalogue or affiliate links. Commercial links are optional and must be individually verified and accompanied by the appropriate paid/affiliate disclosure.
- Monetization/ad breaks are off by default and require an explicit campaign setting and editorial review.

## Token health

scripts/check-meta-token-health.mjs calls Meta's read-only debug_token endpoint. It checks token validity, expected app ID, expiry/data-access expiry and the required Facebook and Instagram permissions: pages_manage_posts, pages_read_engagement, instagram_basic, and instagram_content_publish. It opens a redacted GitHub issue when owner action is required. It never prints token values.

Required GitHub secrets/configuration:
- META_APP_ID
- META_APP_SECRET
- META_PAGE_ACCESS_TOKEN
- META_GRAPH_API_VERSION repository variable
- GitHub's repository token with issue-write permission for alerts

The monitor does not silently re-authenticate an owner, rotate tokens, or write new credentials. Expired/revoked tokens, missing permissions, app mismatch or data-access expiry require owner-led Meta authorization.

## Graph API version maintenance

scripts/check-meta-api-version.mjs reads the official Meta versioning page, compares it with the explicitly configured pin, and opens a maintenance issue when the source cannot be verified, the pin is missing, or the latest version differs. It never auto-upgrades production. A version mismatch requires development-app contract tests and owner review before changing META_GRAPH_API_VERSION.

## Webhook handler

scripts/meta-webhook.mjs implements the Meta GET subscription challenge and POST HMAC-SHA256 signature verification over the raw request body, constant-time comparison, 1 MiB body limit, JSON/schema validation and deterministic event ID. It returns 200 only after the injected durable persistence adapter succeeds; persistence failure returns 503.

The handler is tested as a Node HTTP module. It is NOT a deployed HTTPS endpoint. The production callback URL, TLS, Meta app subscription, verify token, app secret and durable event store remain unconfigured. A production persistence adapter must enforce a unique constraint on event_id, minimise retained personal data and define encryption/retention/deletion. Do not configure the Meta webhook until the endpoint and persistence adapter are deployed and verified.

## Circuit breaker and audit trail

scripts/meta-error-policy.mjs classifies rate-limit, OAuth, permission, abuse/restriction and usage-header conditions. scripts/meta-ops-state.mjs persists a redacted audit record for every Graph API request and opens a durable GitHub-backed circuit state on unsafe errors or usage thresholds. The Facebook feed, Facebook video, Facebook Reel and Instagram Reel publishers check the circuit before reservation and again before each Graph API mutation; an open circuit blocks further mutations while permitting read-only reconciliation GETs. If audit persistence fails after a platform response, the publisher treats the result as ambiguous and requires reconciliation. Automated mock tests cover the state adapter, open-circuit blocking, usage thresholds and persistence failures. The store is currently GitHub JSON files (500-event rolling audit), not a deployed D1-backed service; live Meta behavior remains unverified until credentials are configured and read-only readiness succeeds.

No automatic retry is allowed for ambiguous publication results, OAuth/permission failures, abuse restrictions or rate limits. The circuit remains open until a reviewed owner-authorized state change resets it; it never auto-closes. Do not use proxies, IP rotation or alternate accounts to evade Meta enforcement.

## Future owner inputs and deployment gates

1. Verify the actual Meta Page ID and Page name; configure META_PAGE_ID, META_EXPECTED_PAGE_ID, and META_EXPECTED_PAGE_NAME from authoritative Meta read-only results.
2. Verify the linked Instagram professional account ID; configure META_INSTAGRAM_USER_ID and META_EXPECTED_INSTAGRAM_USER_ID. The read-only readiness check compares the Page's linked account ID.
3. Configure a supported Graph API version after reviewing Meta's current official documentation.
4. Configure valid app ID/secret and Page access token in GitHub secrets; run read-only token and Page/Instagram linkage checks. Never paste tokens into issues, chat or logs.
5. Provision and test a durable webhook event store and HTTPS endpoint; only then subscribe the Meta app.
6. Implement and test persistent circuit-breaker/audit state and reconciliation for uncertain uploads/publications.
7. Complete product deliverable/checkout checks, the 42-asset campaign buffer, website/contact/compliance review, analytics and dashboard.
8. Require exact-hash human and owner approval before any one-shot public release.

A green CI run proves deterministic tests against mocks/fixtures. It does not prove Meta credentials, permissions, Business Manager ownership, webhook delivery, public media accessibility, a deployed endpoint, or successful publication.
