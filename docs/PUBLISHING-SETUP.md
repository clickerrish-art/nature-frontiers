# Nature Frontiers: social publishing setup

## Current status

The catalogue validator and fail-closed Facebook Page publisher adapter are present. A mocked, low-level Instagram Unified Login API client is now present; the campaign-level Instagram publisher, approval workflow, durable Instagram state reservation, and remote end-to-end verification are not yet implemented. The scheduled publishing workflow always forces `PUBLISH_ENABLED=false`; `FACEBOOK_PUBLISH_ENABLED` defaults to `NO`; the manual workflow additionally requires an explicit per-run authorization input and the repository opt-in. `PUBLISH_DRY_RUN` defaults to `true`, and the independent `PUBLISH_EMERGENCY_STOP` defaults to `true`. No live post is sent while the emergency stop is active, publishing is disabled, dry-run is enabled, or no campaign has explicit approval. The repository does not yet provide a verified end-to-end Meta publishing test.

Products in `data/products.json` remain `review-required`. Do not change a product to an approved status until its checkout link, title, price, promotional claims, and usage rights are checked.

## Safe implementation order

1. Verify each Selar checkout page manually against the product title, listed price and deliverables. The current catalogue records separate URLs for YouTube Success Blueprint and Cash Smasher Secrets, but neither destination nor checkout is independently verified by this repository. Do not approve either product until a human checks the live listing and checkout.
2. Create/verify each platform's developer app and account eligibility.
3. Grant only the minimum publishing scopes required. Complete any platform review/audit required for public posting.
4. Add secrets through GitHub repository **Settings → Secrets and variables → Actions**. Never put credentials in JSON, source code, commits, issues, logs, or chat.
5. Run the **Nature Frontiers publishing (gated)** workflow with the emergency stop active and dry-run enabled. The scheduled path forces publishing off; the manual path still requires explicit per-run authorization and repository opt-in. A successful safety run does not validate whether Meta tokens are genuine, current, or authorized.
6. Test the platform API using a private/draft or otherwise non-public method where that platform supports it. Confirm account identity, media requirements, response handling, rate limits, and error handling.
7. The Facebook adapter is implemented and gated. The Instagram API request primitives are implemented with mocked tests, but the Instagram campaign adapter and its gated workflow remain unimplemented. Before any one-shot live Facebook run, verify all external prerequisites, keep the emergency stop active by default, and obtain explicit approval for the exact campaign. The publisher must continue to fail closed when any prerequisite is missing.

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

Meta's current Content Publishing guide explicitly maps Instagram API with Unified Login to a Business Integration System User access token, `graph.facebook.com`, and the `instagram_basic` plus `instagram_content_publish` permissions. Do not substitute the separate Instagram Login flow's `instagram_business_*` scopes or `graph.instagram.com`. The API sequence is `POST /{IG_ID}/media` to create a container, `GET /{CONTAINER_ID}?fields=status_code` to check processing, `POST /{IG_ID}/media_publish` with `creation_id` to publish, then `GET /{MEDIA_ID}?fields=id,permalink,timestamp,media_product_type` for read-back verification. Media URLs supplied to the API must be publicly accessible to Meta. The documented resumable upload option is limited to apps implementing Facebook Login for Business, so this Unified Login client currently accepts publicly hosted media URLs only. The low-level client has mocked tests and never sends a platform request during those tests; it is not yet an approval-aware campaign publisher and must not be wired to live publishing until campaign-level safeguards, durable reservation, and verification are implemented. A token permission grant and successful account-object lookup do not prove media-container creation, publishing, App Review approval, or remote post verification. Keep Instagram publishing disabled until the adapter passes non-public tests and all required access gates are confirmed. Do not reuse `META_PAGE_ACCESS_TOKEN`: that credential belongs to the separate Facebook Page integration.

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


## Instagram campaign publishing (Unified Login)

The Instagram publishing implementation is isolated from the Facebook Page publisher and uses the confirmed Nature Frontiers Instagram account ID `17841413164146618`, Unified Login, Business Integration System User access token (SUAT), `graph.facebook.com`, and the `instagram_basic` + `instagram_content_publish` permission pair. It does not use the separate Instagram Login `instagram_business_*` permissions or `graph.instagram.com`.

### Fail-closed campaign requirements

Instagram campaigns live in `data/instagram-campaigns.json`; this is intentionally separate from the Facebook queue. It currently contains no campaigns. A live campaign must be explicitly `approved`, target `instagram:nature-frontiers`, declare `commercial` and `disclosureRequired`, and carry a recent human approval bound to the exact caption SHA-256, exact media SHA-256 list, and Instagram destination. Product-linked campaigns additionally require an approved catalogue product, the exact catalogue URL in the caption, a current successful link check whose requested and final URLs match that product URL, and verified disclosure. Commercial media requires documented worldwide commercial rights as well as Instagram usage rights.

Every media asset must include a relative `media_path`, SHA-256, cleared worldwide Instagram rights, editing permission, verified source/provenance, clean watermark scan, explicit audio status and audio licence where relevant. AI-generated media requires verified destination-native disclosure. Only one image or one Reel is supported per campaign by this first implementation.

### Controlled public media origin

By default, the workflow uses the public repository's immutable raw-content path `https://raw.githubusercontent.com/clickerrish-art/nature-frontiers/<workflow-commit-sha>/media/instagram/` as the zero-cost controlled origin. Set repository variable `INSTAGRAM_MEDIA_BASE_URL` only if switching to another owner-controlled HTTPS static host. Each campaign's `media_assets[0].media_path` is resolved beneath that base path; arbitrary URLs are not accepted. Before creating a Meta container, the publisher downloads the asset from that exact origin with redirects disabled and verifies the MIME type, byte count, size ceiling, and SHA-256 against the human-approved manifest. Images must be JPEG (maximum 8 MB); Reels must be MP4 (maximum 100 MB on the GitHub raw origin, deliberately below Meta's 300 MB platform limit). Meta's current image specification also requires 4:5 to 1.91:1 aspect ratio and 320–1440 px width; Reels require supported MOV/MP4 container, 3 seconds to 15 minutes, and the documented codec/frame-rate/bitrate limits. The current runtime host gate enforces MIME, file size, byte count and SHA-256; the local `node scripts/check-instagram-media.mjs --kind image|reel --file path` preflight now validates JPEG dimensions/aspect ratio and MP4 container, video codec, frame rate, duration, dimensions, bitrate and AAC audio. Its output includes the SHA-256 and must be stored as `media_assets[0].technical_check`; the campaign gate checks that evidence is recent and bound to the same SHA. The media origin must serve public unauthenticated GET responses with a correct Content-Length. Meta must be able to fetch the same URL publicly.

The public GitHub raw origin is now defined, but no approved Instagram media asset has been uploaded there. Committing a file makes it public immediately. Do not add private media URLs, expiring signed URLs, tokens in URLs, or rights-unverified files. The media directory README documents the supported path and file limits.

### Durable reservation and recovery

`data/instagram-publishing-state.json` stores one reservation per campaign ID, with a fingerprint of destination, caption hash and media hash. GitHub Contents API writes are guarded by a SHA compare-and-swap check and are refused on `main`/`master`. The workflow serializes publishing runs. A reservation is persisted before container creation, the container ID before publication, and `publishing` before the publish request. A successful response is persisted as `published_unverified` before remote read-back; only matching media ID, permalink and media type moves it to `published`.

If the publish request or response is ambiguous, state becomes `unknown`; automatic retries are prohibited. Recovery checks recent account media for one exact caption/type match in the reservation time window. Exactly one match is recorded as reconciled; zero or multiple matches remain held for manual inspection. A known media ID in `published_unverified` can be read back without issuing another publish request.

The publisher checks Meta's `content_publishing_limit` response both when reserving and immediately before publishing, and uses the returned `config.quota_total` and `config.quota_duration` rather than assuming a fixed quota. Meta's current endpoint reference reports a current quota_total of 50 and a 24-hour duration; the general Content Publishing guide also describes a 100-post cap, so the adapter honors the stricter account endpoint value.

### Runtime gates and secrets

Required secret: `INSTAGRAM_ACCESS_TOKEN` (SUAT; never print or commit it). Required repository variable: `META_GRAPH_API_VERSION`. The confirmed Instagram user ID defaults to `17841413164146618` (override with `INSTAGRAM_USER_ID` only if the account changes). The media base defaults to the immutable raw GitHub origin described above (override with `INSTAGRAM_MEDIA_BASE_URL` only when using another owner-controlled host). `INSTAGRAM_PUBLISH_ENABLED` defaults to `NO` and must remain off until launch authorization. The workflow also requires `PUBLISH_ENABLED=true`, `PUBLISH_EMERGENCY_STOP=false`, `PUBLISH_DRY_RUN=false`, and the manual `live_publish_authorized=true` input. Defaults remain fail-closed: emergency stop active, dry-run active, global publishing off, and Instagram publishing off. The Instagram job is manual-dispatch only; it is not enabled on the scheduled Facebook job.

### Test and live verification status

`npm run test:instagram-api` and `npm run test:instagram-campaign` use mocked network calls and must never create a public post. They cover the API request sequence, campaign approvals, rights and disclosure, media technical specifications and hash verification, quota handling, durable reservations, duplicate prevention, ambiguous outcomes and reconciliation. Passing these tests does not prove the Meta token works or that an Instagram post has been published. Remote verification requires a separately authorized real publish after a fully approved campaign and public media asset exist; no such post has been made or claimed.
