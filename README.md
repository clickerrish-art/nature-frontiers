# Nature Frontiers — Marketing Automation

This repository maintains a fixed catalogue of Selar digital products, review-first Facebook campaign drafts, and GitHub Actions checks for campaign data quality and gated publishing.

## Current status

- **Catalogue validation:** passed on `main` at commit `5eba2a7` (manual run #9 on 21 October 2026).
- **Catalogue:** six products with canonical HTTPS Selar links.
- **Campaign queue:** six Facebook drafts, each linked to a catalogue product.
- **Approval:** all products remain `review-required`; all campaigns remain `draft`.
- **Publishing:** keep `PUBLISH_ENABLED=false` and `PUBLISH_DRY_RUN=true`. Do not enable live publishing until the human launch checklist is complete.
- **Website and social accounts:** check these separately; a passing repository validator does not verify the live website, current checkout price, Meta permissions, or published social posts.

## What the automation does

- Validates required product fields, canonical Selar URLs, unique IDs, campaign-to-product links, campaign states, and risky income claims.
- Runs fail-closed publishing safety tests.
- Has a gated Facebook Page adapter. The adapter requires an explicitly approved campaign and product, human-verified links, a valid Page configuration, and durable state reservation before a live post attempt.
- Does not automatically discover products or approve product pages/campaign copy.

## Before launch

Follow [the launch checklist](docs/LAUNCH_CHECKLIST.md). Each product's live checkout page and price must be reviewed by a human. Review the exact public copy and disclosure requirements before approving any campaign.

## Safety and credentials

- Never commit passwords, access tokens, API keys, or other secrets.
- Store credentials only as GitHub Actions secrets after access and permissions are confirmed.
- Do not enable live publishing merely because tests pass.
- Avoid guaranteed-income claims, fake endorsements, misleading scarcity, repetitive spam, and copyrighted media without permission.
- If a live publishing attempt has an ambiguous result, inspect the Page and persisted campaign state before any retry to avoid duplicate posts.

## Workflows

- **Validate Nature Frontiers catalogue:** manual run, pushes to relevant catalogue files on `main`, and a weekly schedule.
- **Nature Frontiers publishing (gated):** pull-request safety tests, manual run, and a daily scheduled gated check.

A successful validation means the data passed automated rules. It is not approval to publish.
