# Nature Frontiers: social publishing setup

## Current status

The catalogue validator is active. The publishing readiness checker is a diagnostic only. **There is no publisher enabled by these files.** Neither workflow sends posts, uploads media, schedules posts, or contacts social APIs.

Products in `data/products.json` remain `review-required`. Do not change a product to an approved status until its checkout link, title, price, promotional claims, and usage rights are checked.

## Safe implementation order

1. Verify each Selar checkout page manually against the product title and listed price. The catalogue currently contains a shared checkout URL for YouTube Success Blueprint and Cash Smasher Secrets; do not promote Cash Smasher Secrets until its checkout destination is confirmed.
2. Create/verify each platform's developer app and account eligibility.
3. Grant only the minimum publishing scopes required. Complete any platform review/audit required for public posting.
4. Add secrets through GitHub repository **Settings → Secrets and variables → Actions**. Never put credentials in JSON, source code, commits, issues, logs, or chat.
5. Run the **Publishing readiness (diagnostic only)** workflow. It reports whether expected secret names are present; it does not validate whether tokens are genuine, current, or authorized.
6. Test the platform API using a private/draft or otherwise non-public method where that platform supports it. Confirm account identity, media requirements, response handling, rate limits, and error handling.
7. Only after the above checks, implement platform-specific publishing adapters. The final publisher must require an explicit approved product and approved post payload, verify links and claims, prevent duplicate sends, log platform post IDs without secrets, and fail closed when any prerequisite is missing.

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
