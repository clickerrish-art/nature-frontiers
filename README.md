# Nature Frontiers — Marketing Automation

This repository maintains a fixed catalogue of Selar digital products, review-first Facebook campaign drafts, and GitHub Actions checks for campaign data quality and gated publishing.

## Current status

- **Catalogue validation:** passed on `main` at commit `9a9fa33` (run #10 on 21 October 2026; [view run](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39601467955)).
- **Catalogue:** six products with canonical HTTPS Selar links.
- **Campaign queue:** six Facebook drafts, each linked to a catalogue product.
- **Approval:** all products remain `review-required`; all campaigns remain `draft`.
- **Publishing:** keep `PUBLISH_ENABLED=false` and `PUBLISH_DRY_RUN=true`. Do not enable live publishing until the human launch checklist is complete.
- **Website and social accounts:** check these separately; a passing repository validator does not verify the live website, current checkout price, Meta permissions, or published social posts.

## Latest branch verification

- Implementation branch: `codex/facebook-reels-publisher`
- Tested branch head: `5839b1a93fd911f0eaf599ddac661834390eb3c8`
- GitHub Actions run #291: https://github.com/clickerrish-art/nature-frontiers/actions/runs/43102248026
- Result: success. Reel guard/media 39/39; long-form guard/media 53/53; Johannesburg cadence 7/7; catalogue and fail-closed checks passed.
- Meta read-only check: the exact Page ID and Page name are verified. Publishing task and upload permission are not yet verified.
- The publisher job was skipped in the PR verification run. No live Facebook post or upload was made.
- No approved original-camera wildlife video or final media artifact is currently recorded. Live publishing remains disabled and dry-run defaults remain in place.

## Long-form series and description requirements

Every long-form episode must be 3–8 minutes, open with its approved hook before any ad break, and carry a series ID, series title, episode number, episode title, series arc and next-episode teaser. The six-episode `Wild Encounters: Crocodile Behaviour` editorial plan is in `data/video-series.json`; it is a plan only, not evidence that footage, scripts or finished videos exist. The narration must begin with the approved hook. Editorial ad-break markers must follow the hook by at least 60 seconds and occur at natural transitions. These offsets are passed to the Meta Page Videos publisher only; they do not configure YouTube mid-rolls. YouTube mid-rolls are available only on monetized videos that are at least eight minutes long.

Every video description must include:
- Nature Frontiers YouTube channel: https://www.youtube.com/@naturefrontiers-life
- All six owner-catalogued Selar product links, including the Wildlife Creator’s Vault: see `scripts/video-description.mjs`.
- All five owner-supplied Safari.com affiliate URLs, embedded verbatim with their `a=GM26` tracking parameters intact.
- The explicit affiliate disclosure.

**Product-link handling:** all six catalogue links are included because the owner explicitly requested them in every description. The five products other than the Wildlife Creator’s Vault remain marked `review-required`; descriptions provide links only and make no unverified product claims. Check each seller page for current details before making product-specific claims.

**Affiliate-link handling:** the owner-supplied Safari.com tracking URLs are recorded in `scripts/video-description.mjs`: Sabi Sand, Kruger National Park, Destinations, Singita Boulders and the 4-day Londolozi Varty Camp fly-in safari. The `a=GM26` tracking parameter is preserved. These are owner-supplied URLs; their current destination availability and booking flow have not been live-tested. The release guard requires all five URLs, their exact presence in the description, and a human verification note; a generic Safari.com homepage is not substituted.

## What the automation does

- Validates required product fields, canonical Selar URLs, unique IDs, campaign-to-product links, campaign states, and risky income claims.
- Runs fail-closed publishing safety tests.
- Has a gated Facebook Page adapter. The adapter requires an explicitly approved campaign and product, human-verified links, a paid-product disclosure, a valid Page configuration, and durable state reservation before a live post attempt. Live publishing additionally requires repository opt-in and a separate manual per-run authorization; scheduled runs cannot publish.
- Does not automatically discover products or approve product pages/campaign copy.

## Before launch

Follow [the launch checklist](docs/LAUNCH_CHECKLIST.md). Each product's live checkout page and price must be reviewed by a human. Review the exact public copy and disclosure requirements before approving any campaign.

## Safety and credentials

- Never commit passwords, access tokens, API keys, or other secrets.
- Store credentials only as GitHub Actions secrets after access and permissions are confirmed.
- Do not enable live publishing merely because tests pass.
- Include a clear paid-product promotional disclosure; add a separate affiliate-commission disclosure wherever commissions apply.
- Avoid guaranteed-income claims, fake endorsements, misleading scarcity, repetitive spam, and copyrighted media without permission.
- If a live publishing attempt has an ambiguous result, inspect the Page and persisted campaign state before any retry to avoid duplicate posts.

## Workflows

- **Validate Nature Frontiers catalogue:** manual run, pushes to relevant catalogue files on `main`, and a weekly schedule.
- **Nature Frontiers publishing (gated):** pull-request safety tests, manual run, and a daily scheduled gated check.

A successful validation means the data passed automated rules. It is not approval to publish.
