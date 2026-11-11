# Nature Frontiers — Marketing Automation

This repository maintains a fixed catalogue of Selar digital products, review-first Facebook campaign drafts, and GitHub Actions checks for campaign data quality and gated publishing.

## Current status

- **Catalogue validation:** passed on `main` at commit `9a9fa33` (run #10 on 21 October 2026; [view run](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39601467955)).
- **Catalogue:** six products with canonical HTTPS Selar links.
- **Campaign queue:** six Facebook drafts, each linked to a catalogue product.
- **Approval:** all products remain `review-required`; all campaigns remain `draft`.
- **Publishing:** keep `PUBLISH_ENABLED=false` and `PUBLISH_DRY_RUN=true`. Do not enable live publishing until the human launch checklist is complete.
- **Website and social accounts:** check these separately; a passing repository validator does not verify the live website, current checkout price, Meta permissions, or published social posts.

## Long-form series and description requirements

Every long-form episode must be 3–8 minutes, open with its approved hook before any ad break, and carry a series ID, series title, episode number, episode title, series arc and next-episode teaser. The narration must begin with the approved hook. Editorial ad-break markers must follow the hook by at least 60 seconds and occur at natural transitions; markers do not guarantee that Meta or YouTube will serve an ad.

Every video description must include:
- Nature Frontiers YouTube channel: https://www.youtube.com/@naturefrontiers-life
- Approved Wildlife Creator's Vault product: https://selar.com/0u19v8u99l
- Each human-verified affiliate tracking URL, embedded verbatim with tracking parameters intact.
- The explicit affiliate disclosure.

**Affiliate-link blocker:** no owner-verified Safari.com tracking URL was found in the accessible project records. A generic Safari.com homepage is not an affiliate link and must not be substituted. The video release guard therefore blocks a video until at least one exact affiliate URL is present in the description and its verification evidence is recorded.

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
