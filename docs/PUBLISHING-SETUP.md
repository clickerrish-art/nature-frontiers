# Nature Frontiers: social publishing setup

## Current status

The catalogue validator and fail-closed Facebook Page publisher adapter are present. The scheduled publishing workflow always forces `PUBLISH_ENABLED=false`; `FACEBOOK_PUBLISH_ENABLED` defaults to `NO`; the manual workflow additionally requires an explicit per-run authorization input and the repository opt-in. `PUBLISH_DRY_RUN` defaults to `true`, and the independent `PUBLISH_EMERGENCY_STOP` defaults to `true`. No live post is sent while the emergency stop is active, publishing is disabled, dry-run is enabled, or no campaign has explicit approval. The repository does not yet provide a verified end-to-end Meta publishing test.

Products in `data/products.json` remain `review-required`. Do not change a product to an approved status until its checkout link, title, price, promotional claims, and usage rights are checked.

## Safe implementation order

1. Verify each Selar checkout page manually against the product title, listed price and deliverables. The current catalogue records separate URLs for YouTube Success Blueprint and Cash Smasher Secrets, but neither destination nor checkout is independently verified by this repository. Do not approve either product until a human checks the live listing and checkout.
2. Create/verify each platform's developer app and account eligibility.
3. Grant only the minimum publishing scopes required. Complete any platform review/audit required for public posting.
4. Add secrets through GitHub repository **Settings → Secrets and variables → Actions**. Never put credentials in JSON, source code, commits, issues, logs, or chat.
5. Run the **Nature Frontiers publishing (gated)** workflow with the emergency stop active and dry-run enabled. The scheduled path forces publishing off; the manual path still requires explicit per-run authorization and repository opt-in. A successful safety run does not validate whether Meta tokens are genuine, current, or authorized.
6. Test the platform API using a private/draft or otherwise non-public method where that platform supports it. Confirm account identity, media requirements, response handling, rate limits, and error handling.
7. The Facebook adapter is already implemented and gated. Additional platform-specific adapters remain unimplemented. Before any one-shot live Facebook run, verify all external prerequisites, keep the emergency stop active by default, and obtain explicit approval for the exact campaign. The publisher must continue to fail closed when any prerequisite is missing.

## Expected GitHub Actions secret names

### Facebook Page
- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`

### Instagram (Meta Unified Login — Instagram Login Compatible)
- Configuration ID: `1133415852647659`.
- Login variation: `General`.
- Selected token type: System-user access token (SUAT), non-expiring.
- Selected asset: Instagram professional account required; ad account optional.
- Selected permissions shown in Meta configuration: `instagram_basic`, `instagram_content_publish`, `instagram_manage_messages`.
- The owner previously removed `instagram_manage_messages` from the App Review request because messaging is not part of the required publishing workflow. Keep messaging out of the requested scope unless the product actually implements Instagram messaging.
- `INSTAGRAM_ACCESS_TOKEN` — the SUAT generated for the Nature Frontiers Instagram asset. Store only as a GitHub Actions secret; never commit or paste it into source, logs, issues, or chat.
- `INSTAGRAM_USER_ID` — `17841413164146618` (the professional account ID verified with a successful Graph API object lookup).
- `INSTAGRAM_GRAPH_API_VERSION` — a currently supported Graph API version, independently configured for the Instagram adapter.

The selected permission names and SUAT are consistent with Meta's System User token support for Instagram API permissions. Do not substitute the separate Instagram Login OAuth flow's `instagram_business_*` scopes or its token lifecycle. The System User token flow is documented by Meta for calls through the Graph API; the precise endpoint and media-publishing sequence must be implemented against the selected Unified Login configuration and verified with non-public requests before publishing. A token permission grant and successful account-object lookup do not prove media-container creation, publishing, App Review approval, or remote post verification. Keep Instagram publishing disabled until the adapter passes non-public tests and all required access gates are confirmed. Do not reuse `META_PAGE_ACCESS_TOKEN`: that credential belongs to the separate Facebook Page integration.

Business Verification is not currently a confirmed requirement for the intended own-account, app-role-only use case. Do not start Tech Provider registration or Business Verification based only on the dashboard card. Reassess only if Meta's actual access-level requirement or reviewer feedback explicitly requires it. The System User token must still be associated with the correct business portfolio and app, with the Instagram asset assigned to that system user.
 
### Pinterest
- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

### TikTok
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_OPEN_ID`

### Nature Frontiers platform boundary
Nature Frontiers is the Facebook/Instagram brand. Do not configure YouTube credentials, YouTube publishing adapters, Nature Frontiers YouTube destinations, or YouTube channel CTAs in this repository. SonicVhibez is the separate YouTube brand. A YouTube connection shown under the Nature Frontiers Metricool brand is not an authorised publishing destination and must not be used. Disconnect the incorrect YouTube connection in Metricool's Connections dashboard after confirming the selected brand.

The Facebook and Instagram integrations still require owner-verified credentials, permissions, and platform-specific tests. No credential name in this document proves that a token is present, valid, current, or authorised.

## Rules for automated content

- Publish only catalogue entries explicitly approved after link and price verification.
- Never infer that a shared Selar link points to both products.
- No guaranteed-income, misleading scarcity, fake endorsement, or unsupported performance claims.
- No repetitive spam or deceptive engagement tactics.
- Use media only when Nature Frontiers has permission to publish it.
- Respect each platform's API policies, media format rules, disclosure requirements, and rate limits.
- Do not publish anything when credentials, link checks, approvals, or platform responses are ambiguous.

## Official references

- Meta Pages API: https://developers.facebook.com/documentation/pages-api/posts
- Instagram API: https://developers.facebook.com/docs/instagram-platform/
- Pinterest API: https://developer.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/
- TikTok Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started/
- YouTube video uploads: https://developers.google.com/youtube/v3/docs/videos/insert
