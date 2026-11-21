# Nature Frontiers wildlife media policy

**Policy status:** owner-confirmed on 20 November 2026.

Nature Frontiers may use properly licensed stock footage in wildlife content. Licensed stock is not represented as a Nature Frontiers field recording or as footage created by Nature Frontiers.

## Permitted media origins

A wildlife campaign must declare exactly one media origin:

- `licensed_stock`: permitted only when the campaign also declares `wildlife_media_policy: "licensed_stock_allowed"` and satisfies every stock-evidence requirement below.
- `original_camera_recording`: permitted only with an identifiable retained original recording, its verified SHA-256, and human provenance review.

AI-generated or synthetic wildlife footage and visuals remain prohibited for documentary wildlife claims. Educational diagrams must be clearly labelled as illustrations and are not evidence of animal behaviour.

## Required evidence for every licensed-stock asset

1. Original source-page URL using HTTPS.
2. Creator name as shown by the source.
3. Exact licence name and HTTPS link to the applicable licence terms.
4. Human rights/provenance review with named reviewer and timestamp.
5. Verified SHA-256 of the exact media file used by the edit.
6. Technical review and accessibility verification.
7. Human review for animal welfare: no baiting, harassment, handling, staging or disturbance.
8. Human review that the footage is non-graphic and appropriate.
9. On-screen disclosure burned into or otherwise visibly present in the final rendered video. The campaign must record the exact disclosure text and a human confirmation bound to the same final media SHA-256 (on_screen_disclosure_media_sha256 must equal media_sha256). Any edit or re-export changes the hash and requires a fresh disclosure review.
10. Creator/source attribution in the caption or credits.

Suggested disclosure:

> Licensed stock footage — illustrative; not a Nature Frontiers field recording.

Suggested credit:

> Footage: [creator] via [source].

The wording must not imply that Nature Frontiers recorded the footage or that the creator, people, brands or depicted parties endorse Nature Frontiers.

## Commercial links

Editorial wildlife Reels do not require unrelated YouTube, product-catalogue or affiliate links. If a campaign includes product or affiliate links, each supplied URL must be HTTPS, human-verified and present in the caption with the matching disclosure. Do not add commercial links solely to satisfy a template.

## Series linkage

A Reel requires a published long-form parent only when the campaign explicitly declares `series_requires_parent: true`. Standalone editorial Reels are permitted without a parent episode.

## Release controls

Every Reel still requires explicit campaign approval, exact media SHA-256, rights confirmation, human policy review, welfare review, non-graphic review, media accessibility and technical review. The publishing workflow must remain disabled/dry-run by default. This policy does not authorize scheduling, uploading or public publication.
