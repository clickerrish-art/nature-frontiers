# Nature Frontiers: publishing architecture and release setup

Last reconciled: 12 November 2026. This document supersedes the older setup notes below.

## Current implementation

The repository contains three Facebook publishing adapters:

- `scripts/publish-facebook.mjs`: legacy text/link feed adapter. It is available as an npm script but is not called by the current gated workflow.
- `scripts/publish-facebook-video.mjs`: hash-verified long-form Page video adapter.
- `scripts/publish-facebook-reel.mjs`: hash-verified discovery Reel adapter. It requires an already-published parent long-form video from the same Nature Frontiers Page.

The `.github/workflows/publishing-readiness.yml` workflow runs the safety/regression suite and a read-only Meta Page identity/token check. Its scheduled and push-triggered runs do not publish. A manual dispatch selects exactly one publisher adapter per authorization. The publisher job runs only on a manual `workflow_dispatch`, only from the protected production branch `main`, only after both prerequisite jobs pass, and only when the separate `live_publish_authorized` input is explicitly true. That input defaults to false. The dispatch must select exactly one adapter (`feed`, `reel` or `video`) so a single authorization cannot fan out across multiple publishers. The workflow job and each adapter independently reject live execution from any branch other than `main`; pull-request and implementation branches cannot publish.

The long-form and Reel scripts independently require all of the following before any live request:

- `PUBLISH_ENABLED=true`
- `PUBLISH_DRY_RUN=false`
- `PUBLISH_RUN_AUTHORIZED=true` from the explicit one-run workflow authorization
- exact Nature Frontiers Page ID `1003575786161492`
- a valid Page token and configured Graph API version
- durable GitHub campaign-state access
- exactly one campaign in approved state with all media, rights, provenance, factual, hash and human-review gates satisfied

The legacy text/link feed adapter also requires the per-run authorization and exact Page ID. Its human review record must include an identified reviewer, valid timestamp, explicit approval and a SHA-256 matching the exact caption and release metadata. Changing the caption or reviewed metadata invalidates approval. It shares one daily feed slot with long-form Page video; the daily cadence permits up to two Reels plus one feed post per Johannesburg calendar day. All adapters fail closed when the required state or evidence is missing. Uncertain publication outcomes remain reserved for manual reconciliation; they must not be blindly retried.

## Current external release blockers

- The latest read-only Meta check reports HTTP 401 / OAuth error 190 / subcode 463 for the configured Page token. It is expired, invalid or revoked. Replace `META_PAGE_ACCESS_TOKEN` privately in GitHub repository Settings → Secrets and variables → Actions. Never paste a token into chat, a commit, a log or a campaign file.
- The Nature Frontiers Metricool brand currently maps its YouTube field to the separate SonicVibes channel ID `UCSlkuPfHH78oGC1o418HV4w`. Do not publish Nature Frontiers YouTube videos through that mapping. The verified Nature Frontiers channel is `@naturefrontiers-life`, ID `UC41xXhw22o6Q2I2pTKB2kOg`.
- The repository validates YouTube series, episode metadata and descriptions; it does not upload or schedule YouTube videos. Channel identity authorization is not evidence that a video has been uploaded.
- Actual documentary footage must be original camera footage with retained source files, verifiable provenance, rights evidence, fact-check sources and human review. A hash or successful technical media inspection alone does not prove those rights or editorial approvals.
- No Instagram, TikTok or Pinterest publishing adapter is implemented in this repository.

## Catalogue and campaign state

The current catalogue contains six products and six Facebook promotional campaign drafts. All products remain `review-required`; all campaigns remain `draft`. Do not promote any product or campaign to approved based only on a URL or a previous listing snapshot. Verify the exact live checkout destination, title, deliverables, price, promotional claims and any applicable affiliate relationship before approval. The current catalogue has distinct URLs for the six products; if a future edit reuses a checkout URL, require explicit human confirmation for that exact shared destination.

The current campaign validator checks the product-to-caption URL match, paid-product disclosure, campaign state, duplicate IDs, media rights and supported campaign types. A successful catalogue validation does not establish that a product file, checkout or claim has been independently inspected.

## Secrets and variables

Store credentials only in GitHub Actions secrets.

### Facebook Page

- `META_PAGE_ACCESS_TOKEN` — current Page token with the minimum required Page permissions.
- `META_PAGE_ID` is fixed in the gated workflow to `1003575786161492`.
- `META_GRAPH_API_VERSION` is set in the workflow; the syntax check does not prove that Meta still supports that version.

Repository Actions variables:

- `EMERGENCY_STOP` must remain `true` by default; every Facebook adapter independently stops unless it is explicitly set to `false` for an owner-authorized operation.
- `PUBLISH_ENABLED` must remain `false` until the owner separately authorizes a release.
- `PUBLISH_DRY_RUN` must remain `true` until an explicitly approved one-run release.
- The workflow's `live_publish_authorized` input defaults to `false`; do not change the default.

### YouTube

The verified channel is `UC41xXhw22o6Q2I2pTKB2kOg` (`@naturefrontiers-life`). The channel ID and handle are recorded in `data/youtube-content-policy.json`. No YouTube upload token or production upload adapter is configured by this repository. Do not substitute the mismatched Metricool YouTube connection.

## Release and recovery rules

1. Keep every campaign in draft until the exact final media, metadata, destination, rights, provenance, facts and human approval are verified.
2. Long-form wildlife video must be 16:9, 3–8 minutes, and use original camera recordings. Discovery Reels must pass their separate portrait format, duration, source, rights and review checks.
3. Each final artefact is bound to its SHA-256 hash and the named/timestamped human-review record. Rights evidence must identify the relevant footage and audio/music licences or ownership.
4. The media adapter verifies public HTTPS resolution, redirects, byte limits, file hashes and technical media metadata before upload.
5. A publisher reserves campaign state before contacting Meta. If a request times out or its result is ambiguous, leave the reservation intact and inspect the Page and GitHub state before any manual recovery. Never automatically retry an uncertain upload.
6. Confirm the remote receipt matches the exact uploaded media ID, exact Nature Frontiers Page owner and HTTPS Facebook permalink before recording publication success.
7. A Reel may only refer to a parent video that is already published by the same Page.
8. A green CI run, a connected account, a local draft, a read-only API check or a successful media hash is not authorisation to publish.
9. Keep `EMERGENCY_STOP=true` by default. Never release the emergency stop or enable public publishing merely to clear a failing readiness check.

## Historical implementation notes

Earlier revisions of this document described the project as having no publishing adapters and a shared Selar URL for two products. Those statements are obsolete: the gated Facebook adapters now exist, and the current catalogue uses distinct product URLs. Retain this section only as a correction record; follow the current implementation and blocker sections above.
