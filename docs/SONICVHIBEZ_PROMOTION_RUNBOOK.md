# SonicVhibez promotion and Nature Frontiers safety runbook

## Purpose
This is an isolated operating plan for Selar-product promotion. It must not alter the existing Nature Frontiers wildlife/science publishing strategy or publish promotional material to the Nature Frontiers YouTube channel.

## Current verified state (22 October 2026)
- The GitHub repository's Facebook adapter is fail-closed. `PUBLISH_ENABLED` must be explicitly true and `PUBLISH_DRY_RUN` must be explicitly false before a live request; an approved product and exactly one approved campaign are also required.
- The connected Metricool brand is **Nature Frontiers**, with YouTube channel ID `UCSlkuPfHH78oGC1o418HV4w`. Do not use this brand for SonicVhibez YouTube promotion.
- Fifteen scheduled posts in the Nature Frontiers Metricool planner were converted to drafts with auto-publishing disabled after a channel-separation review. Verify the planner before making further schedule changes.
- The connected HeyGen workspace reports the Free plan. A production-grade recurring video pipeline and queue replenishment have not been demonstrated.
- A successful GitHub Actions safety run is not proof that a post was published or that a connected channel is the intended destination.

## Required go-live gates
1. Connect and positively identify the separate SonicVhibez YouTube channel in Metricool (verify its channel ID and brand). If unavailable, use a separate authorized YouTube publishing integration; do not route through Nature Frontiers.
2. Keep all Selar campaign copy in review-required/draft state until a person has opened the exact product link, confirmed the product identity and current price, and approved the copy. Do not infer checkout verification from a URL alone.
3. Confirm any affiliate relationship and put a clear affiliate disclosure on the relevant post. For paid digital product promotion, include an unambiguous advertising/promotion disclosure.
4. Generate each video and thumbnail, check that media exists and plays, confirm narration and captions, verify factual wildlife claims and rights to media, then run a quality checklist. Do not represent a numeric SEO score as guaranteed performance.
5. Use idempotent campaign IDs and durable status reservation. If a platform response is ambiguous, stop and inspect the destination before retrying.
6. Only schedule on the explicitly verified SonicVhibez destination after the above gates pass. Keep Nature Frontiers promotional posts as drafts.
7. Maintain a rolling queue only from approved assets. A failed generation, missing media, low quality check, missing disclosure, unverified URL, or wrong destination must block publication and surface a report.

## Honest automation boundary
The existing repository currently validates catalogue/campaign data and gates its Facebook Page adapter. It does not by itself generate finished 55-second videos, create thumbnails, connect SonicVhibez, or replenish a Metricool queue. Do not claim those tasks are automated until they are implemented and a complete end-to-end test confirms the output and destination.

## Acceptance test before live posting
- One sample campaign uses a known Selar URL and has documented human verification.
- One 45–60 second sample video has a usable voice track, captions, documentary-style licensed/authorized visuals, and thumbnail.
- The rendered output is reviewed and passes the campaign checklist.
- Destination metadata proves the post targets SonicVhibez, not Nature Frontiers.
- A dry-run validates all required fields and makes no public API request.
- A single explicitly authorized test post is verified on the destination; its post ID is recorded; duplicate retry is blocked.
- A scheduled queue replenishment test adds a draft only and does not publish without the same gates.

## Operator links
- Repository: https://github.com/clickerrish-art/nature-frontiers
- GitHub Actions: https://github.com/clickerrish-art/nature-frontiers/actions
- Metricool planner: https://app.metricool.com/planner
- Selar storefront: https://selar.com/m/kehinde-ajiboye3108854
