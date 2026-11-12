# Nature Frontiers — Marketing Automation

This repository maintains a fixed catalogue of Selar digital products, review-first Facebook campaign drafts, and GitHub Actions checks for campaign data quality and gated publishing.

## Current status

Run `npm test` to execute the complete repository test suite (feed guards, fail-closed publishing, cadence, YouTube, Reel and long-form video/media tests).

- **Catalogue validation:** the `main` result at `9a9fa33` (21 October 2026) is a historical baseline, not the latest branch verification. The current implementation branch is verified by the GitHub Actions runs recorded below.
- **Catalogue:** six products with canonical HTTPS Selar links.
- **Repository campaign fixtures:** six Facebook draft records, each linked to a catalogue product. This is separate from the live Metricool planner queue.
- **Approval:** all products remain `review-required`; all campaigns remain `draft`.
- **Publishing:** keep `PUBLISH_ENABLED=false`, `PUBLISH_DRY_RUN=true` and `EMERGENCY_STOP=true`. All three Facebook adapters independently fail closed while the emergency stop is active; live mode additionally requires explicit one-run authorization and exact Nature Frontiers Page ID `1003575786161492`. The workflow defaults the emergency stop to active and the one-run authorization to false, and live publishing is restricted to the exact implementation branch `codex/nature-frontiers-youtube-series`. Do not enable live publishing until all release gates are complete.
- **Latest implementation-branch checks:** YouTube content workflow [43300919195](https://github.com/clickerrish-art/nature-frontiers/actions/runs/43300919195) passed on exact code head `0c2768f93c4e6118cff800ffe8d84eb30fb0a050` with 15/15 YouTube tests. Publishing workflow [43300919205](https://github.com/clickerrish-art/nature-frontiers/actions/runs/43300919205) passed all safety checks: 150 automated tests, 0 failures, 0 skips, plus 20/20 fail-closed publisher scenarios. The Meta read-only check still fails because the Page token returns HTTP 401 / OAuth error 190 / subcode 463; Facebook publishing is skipped. These are branch checks, not a release or proof of a live post.
- **Nature Frontiers YouTube content standard:** long-form episodes are 3–8 minutes (16:9), planned as numbered series episodes, with the hook first and every description generated with the channel link, all catalogue product links, all owner-supplied Safari.com affiliate links and disclosures. See [the YouTube series and release standard](docs/YOUTUBE_SERIES_AND_DESCRIPTION_STANDARD.md).
- **YouTube channel identity:** verified through the directly authorized vidIQ owner-access connection on 12 November 2026: `@naturefrontiers-life` / `UC41xXhw22o6Q2I2pTKB2kOg`. Metricool's Nature Frontiers brand still points its YouTube field at the separate SonicVibes channel; do not use that Metricool mapping for Nature Frontiers publishing. OAuth upload from this repository, monetization eligibility and automatic scheduling remain unverified or disabled. YouTube's native paid-promotion declaration is required whenever the video itself contains a qualifying paid promotion. Content packaging tests do not prove live publishing.
- **YouTube content CI:** the standalone `Validate Nature Frontiers YouTube content` workflow checks the policy JSON, product catalogue, series slate, module and CLI syntax, generated sample description, and regression tests without depending on Meta credentials or invoking a publishing adapter. Mid-roll slots require independently verified channel monetization eligibility, an actual continuous story-segment boundary, and a reviewer, timestamp and placement note. The validator rejects gaps or incomplete episode timelines, descriptions longer than YouTube’s 5,000-character limit, unsafe episode links, titles over 100 characters, unsupported publication states, and approvals without original-footage source reference and SHA-256, rights evidence, fact-check source references, and named/timestamped human review bound to video and metadata SHA-256. Mid-roll eligibility requires recorded evidence tied to the exact Nature Frontiers channel ID, a verifier and timestamp, plus explicit confirmation that protected animal behaviour, reveals and payoffs are not interrupted.
- **PR integration:** PR #12 now targets `main`, is based directly on the current main history with zero commits behind, and GitHub reports it mergeable. It remains a draft and has not been merged. `main` remains unchanged at `22869bc8dbc30a8a6edc4b6a87ad55b27b89e368`.
- **Website and social accounts:** check these separately; a passing repository validator does not verify the live website, current checkout price, Meta permissions, or published social posts.

## YouTube content packaging

- Builds series descriptions with the Nature Frontiers channel CTA, all catalogue product links, and the five Safari.com affiliate destinations using the original `a=GM26` tracking value. Use `npm run build:youtube-description -- path/to/episode.json` to produce a validated description.
- Validates the 3–8 minute runtime, the ordered hook/story/takeaway/next-episode/CTA structure, and mid-roll placement only on eligible 8-minute monetized videos at natural segment boundaries.
- Provides a six-episode `Wild Encounters` Season 1 concept slate and a first-episode description input at `content/youtube/wild-encounters-s01e01-description.json`. These are not rendered or approved videos.
- Keeps the original-footage, provenance, rights and factual-review gates fail-closed.

## What the automation does

- Validates required product fields, canonical Selar URLs, unique IDs, campaign-to-product links, campaign states, and risky income claims.
- Runs fail-closed publishing safety tests.
- Has gated Facebook text/link feed, long-form video and Reel adapters. Each live adapter requires exact Page identity, an explicitly approved campaign, human-verified rights/review evidence, durable state reservation and a separate one-run authorization. The gated manual workflow lets the owner select exactly one adapter (feed, long-form video or Reel) per one-shot authorization and only runs live publishing from `codex/nature-frontiers-youtube-series`. The feed adapter shares one daily feed slot with long-form Page video; the cadence allows at most two Reels and one feed post per Johannesburg calendar day. Feed approval requires a named, timestamped human review whose SHA-256 matches the exact release metadata. Scheduled runs cannot publish.
- Does not automatically discover products or approve product pages/campaign copy.
- Facebook long-form and Reel approvals require separate footage/audio rights evidence and SHA-256 hashes for video, script, voiceover, captions, thumbnail and metadata, all matched to the named/timestamped human-review record. Both publishers verify the exact remote video ID and Page owner before recording success; a Reel must link to a parent long-form video from the same Page. Both media preflights now require an actual AAC audio stream, duration within 1.5 seconds of the video, at least 44.1 kHz, and mono/stereo channels. Reel requests use explicit network timeouts and retain uncertain outcomes for reconciliation.

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
