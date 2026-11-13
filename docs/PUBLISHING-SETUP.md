# Nature Frontiers: social publishing setup

## Current status

The catalogue validator and fail-closed Facebook Page publisher adapter are present. The scheduled publishing workflow always forces `PUBLISH_ENABLED=false`; the manual workflow additionally requires an explicit per-run authorization input and the repository opt-in. `PUBLISH_DRY_RUN` defaults to `true`, and the independent `PUBLISH_EMERGENCY_STOP` defaults to `true`. No live post is sent while the emergency stop is active, publishing is disabled, dry-run is enabled, or no campaign has explicit approval. The repository does not yet provide a verified end-to-end Meta publishing test.

Products in `data/products.json` remain `review-required`. Do not change a product to an approved status until its checkout link, title, price, promotional claims, and usage rights are checked.

## Safe implementation order

1. Verify each Selar checkout page manually against the product title and listed price. The catalogue currently contains a shared checkout URL for YouTube Success Blueprint and Cash Smasher Secrets; do not promote Cash Smasher Secrets until its checkout destination is confirmed.
2. Create/verify each platform's developer app and account eligibility.
3. Grant only the minimum publishing scopes required. Complete any platform review/audit required for public posting.
4. Add secrets through GitHub repository **Settings → Secrets and variables → Actions**. Never put credentials in JSON, source code, commits, issues, logs, or chat.
5. Run the **Publishing readiness (diagnostic only)** workflow. It reports whether expected secret names are present; it does not validate whether tokens are genuine, current, or authorized.
6. Test the platform API using a private/draft or otherwise non-public method where that platform supports it. Confirm account identity, media requirements, response handling, rate limits, and error handling.
7. The Facebook adapter is already implemented and gated. Additional platform-specific adapters remain unimplemented. Before any one-shot live Facebook run, verify all external prerequisites, keep the emergency stop active by default, and obtain explicit approval for the exact campaign. The publisher must continue to fail closed when any prerequisite is missing.

## Expected GitHub Actions secret names

### Facebook Page
- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`

### Instagram
- `META_PAGE_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`

The correct Meta account/login flow determines the full set of app credentials and permissions. Verify the current official Meta documentation before implementation.

### Pinterest
- `PINTEREST_ACCESS_TOKEN`
- `PINTEREST_BOARD_ID`

### TikTok
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_OPEN_ID`

### YouTube
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_CHANNEL_ID`

These are proposed names for this repository, not credentials already configured. A name being present does not prove a token is valid or that publishing permission has been granted.

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
