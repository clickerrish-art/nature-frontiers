# Nature Frontiers launch checklist

> **Status note (12 November 2026):** The detailed website/product observations below are a historical snapshot from 21–22 October 2026, not a fresh website or checkout inspection. See [PUBLISHING-SETUP.md](PUBLISHING-SETUP.md) for the current publishing architecture and verified blockers, and the README for the latest CI results. Do not treat old checked boxes or historical workflow runs as current release approval.

Use this checklist before any campaign is approved or any live publishing is enabled. Automated validation is necessary, but it does not replace the human checks below.

## 1. Product and checkout verification

For each of the six entries in `data/products.json`:

- [ ] Open the canonical Selar URL in a normal browser session.
- [ ] Confirm the destination is the intended product, not a different product or a generic page.
- [ ] Confirm the live title, displayed price, currency, product format, and included deliverables.
- [ ] Confirm the checkout works through the point before payment; do not place a test order unless intentionally authorised.
- [ ] Compare the live page with the catalogue and correct discrepancies through a reviewed pull request.
- [ ] Confirm any discount or crossed-out price is current before mentioning it publicly.

Current catalogue prices are recorded in `data/products.json`; they can change and must not be treated as independently live-verified by the validator.

### Owner-confirmed Selar page checks (21 October 2026)

- [x] The owner opened all six Selar product pages and confirmed that each page opened and its product title and displayed price matched the catalogue: Wildlife Creator's Vault (R999), Video Creation Prompt Pack Premium Edition (R570), YouTube Success Blueprint (R599), Internet Marketing Bible (R299), Online Money Practical Guide (R150), and Cash Smasher Secrets (R161.60).
- [x] Wildlife Creator's Vault: owner supplied the live listing text showing ZAR, R999, a downloadable Premium Combo PDF, and a described field-to-feed wildlife content system for ideas, storytelling, captions, educational content, and consistent publishing. The listing describes intended benefits but does not expose the actual PDF files for independent inspection.
- [x] Video Creation Prompt Pack Premium Edition: owner supplied the listing text showing title, R570 displayed against R750, 20 ready-to-use AI prompts across six connected stages (research/angle, scripting, thumbnail, title/metadata, production support, posting/optimization), and workflow guidance. The text does not independently verify the actual downloadable files or checkout flow; recheck the crossed-out price before promotion.
- [x] YouTube Success Blueprint: owner supplied the listing text showing title, R599, and a described 90-day creator system covering channel setup, niche/audience, ideas, video creation, packaging, analytics, growth, monetization, AI workflows, checklists, and a 30/60/90-day plan. The text does not independently verify the actual deliverable files or checkout flow.
- [x] Internet Marketing Bible: owner supplied the live listing text showing title, displayed price R299, and a 105-page guide described as covering social media/networking, customer acquisition and retention, and internet-marketing approaches. The supplied text does not independently verify the ebook file or checkout flow.
- [x] Online Money Practical Guide: owner supplied the live listing text showing title, displayed price R150, and a beginner-focused digital guide described as covering online income opportunities, work-from-home ideas, additional income streams, starting with limited resources, and assessing opportunities against skills and goals. The listing explicitly says it does not guarantee income, profits, employment, or financial results; the actual ebook file and checkout flow remain unverified.
- [x] Cash Smasher Secrets: owner supplied the live listing text showing title, displayed price R161.60, and a guide described as covering online business, affiliate marketing, digital products, freelancing, e-commerce, entrepreneurship, income diversification, and scaling/systemizing income. The actual ebook file and checkout flow remain unverified; the listing text does not establish evidence for any income outcomes.
- [ ] Checkout flow has not been tested for any product; no test purchase was made. Any discount/crossed-out price should be rechecked before promotion.

## 2. Campaign review

Final editorial review completed on 21 October 2026 for all six draft captions. Captions and catalogue URLs were cross-checked; wording was reviewed for clarity, unsupported claims, pressure tactics, fake endorsements, and guaranteed results. The three creator-focused offers are the strongest audience fit. The other three are general online-business/marketing resources, not wildlife products; their copy now says so explicitly, and Cash Smasher Secrets remains deliberately cautious because its full contents have not been independently verified.

Editorial disposition by campaign:

| Product | Editorial finding | Launch recommendation |
| --- | --- | --- |
| Complete YouTube Wildlife Creator's Vault | Strong Nature Frontiers fit; cautious copy; destination matches catalogue | Ready for owner review after checkout/content and disclosure checks |
| Video Creation Prompt Pack Premium Edition | Strong creator fit; copy describes the workflow recorded in the catalogue; destination matches | Ready for owner review after checkout/content and disclosure checks |
| YouTube Success Blueprint | Creator fit; no guaranteed-growth claim; destination matches | Ready for owner review after checkout/content and disclosure checks |
| Internet Marketing Bible | General marketing education, not wildlife content; copy labels it accordingly | Hold out of the first Nature Frontiers campaign wave |
| Online Money Practical Guide | General online-income education, not wildlife content; no income promise | Hold out of the first Nature Frontiers campaign wave |
| Cash Smasher Secrets | General online-business offer; contents remain unverified and caption avoids unsupported detail | Hold out of the first campaign wave pending product-content verification |

Working launch decision for this review: prioritise the three creator-focused products for the first campaign wave and keep Internet Marketing Bible, Online Money Practical Guide, and Cash Smasher Secrets on hold as separate general-business offers. This does not approve any product or authorise publishing. This is an editorial review, not product approval or permission to publish. For Wildlife Creator's Vault, the owner also supplied the listing description, downloadable format, and ZAR currency as visible page evidence; the actual PDF contents and checkout flow remain unverified. For the other five products, owner-confirmed checks established page access, title, and displayed price only. Actual downloadable files/deliverable contents and checkout flow remain unverified for all six products. For Cash Smasher Secrets, the supplied listing describes an ebook/guide but its actual file and claims remain unverified. Internet Marketing Bible is described on the owner-supplied listing as a 105-page guide, but the ebook file itself has not been inspected. The Video Creation Prompt Pack page showed R570 against R750, so that comparison must be rechecked before promotion. Affiliate/commercial relationship and required disclosures, Meta Page permissions, and live publisher readiness remain unverified. All six product statuses remain `review-required`, and all six campaigns remain `draft`.

Completed in this review:
- [x] Review all six captions for clarity, cautious wording, and unsupported or guaranteed-results claims.
- [x] Confirm each caption contains the matching catalogue URL.
- [x] Make the general-business nature of the last three offers explicit; keep Cash Smasher Secrets cautious pending verification.
- [x] Keep all six campaigns in `draft` and all products in `review-required`.
- [ ] Confirm product contents/deliverables and checkout details before approval.
- [x] Add a clear paid-product promotional disclosure to all six draft captions and enforce it in catalogue validation and the publisher's fail-closed checks.
- [ ] Confirm whether any separate affiliate commission relationship applies; if so, add an explicit affiliate-commission disclosure before approval.
- [ ] Confirm Meta Page permissions and publishing configuration.
- [ ] Obtain owner approval for each specific product/campaign before any status change or publication.

Do not mark a product `approved`, a campaign `approved`, or a link verified unless the human checks were actually completed and documented.

## 3. Publishing safety

- [x] Add a per-run live-publishing authorization input that defaults to false; scheduled runs cannot enable live publishing, and repository `PUBLISH_ENABLED=true` alone is insufficient.
- [ ] Confirm GitHub repository variables remain `PUBLISH_ENABLED=false` and `PUBLISH_DRY_RUN=true`.
- [ ] Confirm the Meta Page ID and access token are valid, least-privilege credentials stored only in GitHub Actions secrets.
- [ ] Confirm the requested Meta permissions and the current Graph API version are supported for the intended Page; repository code cannot verify live token permissions without a secure authorized API test.
- [ ] Review the publisher workflow and the one-campaign-per-run restriction.
- [x] Catalogue validation passed after PR #10 merged (run [39627608263](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39627608263)); publishing safety tests passed on PR run [39627261595](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39627261595), with the live publisher skipped.
- [ ] Confirm no campaign is left in `publishing` after an ambiguous result; manually reconcile the Page and GitHub state before retrying.
- [ ] Authorise a specific first live post only after all reviews and a dry-run plan are complete.

A green workflow is not authorisation to publish. Do not enable live publishing as part of routine maintenance.

## 4. Website and channel checks

Public site navigation was checked on 21 October 2026 via the homepage's actual menu links (not guessed slugs):

- [x] Homepage loads and displays current wildlife-focused branding: “Learn. Wonder. Protect.” and “Where the Wild Still Holds Secrets.”
- [x] Videos page loads and displays the wildlife introduction and `[youtube-feed feed=1]` embed. Actual video playback still requires a normal browser.
- [x] About page loads and displays wildlife-focused purpose and editorial positioning.
- [x] Shop page loads and displays nine products with prices and add-to-cart controls.
- [x] Educational Bundles and Teacher Resources pages load and display relevant resources.
- [x] Conservation page loads and displays conservation-focused content.
- [x] Affiliate Recommendations page loads and displays wildlife recommendations and product links.
- [x] Contact page loads and displays a contact form and the email `naturefrontiers@gmail.com`.
- [x] Blog index now verified through the homepage's actual Blog navigation link on 22 October 2026; it displays two latest-post entries.
- [ ] Contact page displays the apparent placeholder address `Example avenue 100, example country`; replace it with a verified address or remove the address section in WordPress before launch.
- [ ] Shop page footer displays the apparent placeholder phone number `(+1) 23456789`; replace it with a verified business number or remove it in WordPress before launch.
- [ ] Confirm privacy-policy link and policy content, including the contact form's consent statement, in a normal browser. This remains an external WordPress/browser check and was not changed here.
- [x] Confirm the repository's six promotional campaign drafts now include a paid-product disclosure.
- [ ] Confirm the live website's affiliate/commercial disclosure is clear and appears where needed before users follow affiliate links; this requires a live-site browser check.
- [ ] Confirm embedded YouTube feed plays in a normal browser on desktop and mobile; text extraction cannot verify playback.
- [ ] Test cart/checkout up to the point before payment; do not place a purchase.
- [ ] Test mobile layout and primary navigation on an actual mobile-sized browser.
- [ ] Verify analytics/measurement is configured only where consent and platform rules allow.

The owner previously confirmed the newsletter works and asked that the website be left as-is. The public text extraction shows a newsletter fallback message, which conflicts with the owner's browser check; do not change the newsletter based on text extraction alone. This checklist records the observed placeholders but does not authorise website edits. No WordPress write access was available during this review.

## 5. First-week operating routine

- [ ] Review workflow results after scheduled runs.
- [ ] Review clicks, product-page visits, sales, and YouTube analytics without assuming a sale from a click.
- [ ] Prioritise helpful evergreen wildlife/nature content and search-led titles over repetitive product promotion.
- [ ] Keep a simple record of campaign, date, destination, clicks, sales, and lessons learned.
- [ ] Recheck product URLs and prices before reusing campaign copy.

## Current known status (22 October 2026)

- Catalogue validation run #11: successful on `main`, commit `003622d59c039fdc4a70f7a50c9952b3bdd30f3b` after PR #10 was merged.
- PR #5 updated the GitHub Actions workflows to Node.js 24-compatible checkout/setup-node actions and scoped write permission to the gated publisher job.
- Six products exist and all have catalogue URLs; all remain `review-required`.
- Six Facebook campaigns exist and all remain `draft`.
- GitHub Pages deployment for commit `003622d59c039fdc4a70f7a50c9952b3bdd30f3b` succeeded (Actions run [39627607612](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39627607612); build, deploy, and status-report jobs all succeeded).
- Publishing safety workflow run [39627261595](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39627261595) passed safety tests and skipped the Facebook publisher; this did not publish any campaign.
- The publishing workflow now requires both repository opt-in and a separate per-run manual authorization; scheduled runs are forced off. The repository's actual secret/variable values and Meta Page permissions remain unverified.
- All six draft captions now include a paid-product promotional disclosure, enforced by both catalogue validation and the publisher adapter. A separate affiliate-commission disclosure is still needed if these links earn commissions.
- Live publishing must remain disabled until explicit human launch approval.
- Homepage, Videos, About, Shop, Educational Bundles, Teacher Resources, Conservation, Affiliate Recommendations, Contact, and Blog pages were reached through the live site's navigation. The Blog index displays two posts. Contact page shows an apparent placeholder address; Shop footer shows an apparent placeholder phone number. Mobile layout and embedded YouTube playback remain unverified. The contact form references a Privacy Policy, but policy content could not be verified in the available public extraction. The Affiliate Recommendations page's extracted content did not show a clear affiliate/commercial disclosure; treat this as a launch blocker until checked and corrected in WordPress. Checkout remains unverified and is intentionally outside this review. The owner reports the newsletter works; do not change it based on crawler output.


## Deployment follow-up (22 October 2026)

- [x] The checklist-only GitHub Pages deployment completed successfully: Actions run [39724958455](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39724958455); build, deploy, and status-report jobs all succeeded. This confirms deployment of the repository checklist update, not the completion of external WordPress, Meta, browser, or Selar checks.


## Current release status — 12 November 2026

This section supersedes older implementation-status bullets above where the dates or implementation state differ.

- The six catalogue products remain `review-required`; the six repository Facebook campaigns remain `draft`. The current catalogue contains distinct Selar URLs, but the live checkout, price, currency, downloadable files and deliverables have not been freshly re-verified for this release.
- The live Meta read-only check confirms the configured Page ID `1003575786161492` but rejects the Page token with HTTP 401 / OAuth error 190 / subcode 463. Replace the token privately in GitHub Actions secrets before any Meta publishing.
- Nature Frontiers YouTube identity is verified as `@naturefrontiers-life` / `UC41xXhw22o6Q2I2pTKB2kOg`. Metricool's Nature Frontiers brand still maps YouTube to the separate SonicVibes channel ID `UCSlkuPfHH78oGC1o418HV4w`; do not use that mapping for Nature Frontiers publishing.
- The YouTube series and description validator passes, but the six-episode season is still `concept_only`. There is no verified rendered/approved documentary, upload or scheduled YouTube release.
- Latest completed full publishing workflow for exact code head `0c2768f93c4e6118cff800ffe8d84eb30fb0a050` ([run 43300919205](https://github.com/clickerrish-art/nature-frontiers/actions/runs/43300919205)): safety job passed 150 automated tests (0 failed, 0 skipped) and 20 fail-closed publisher scenarios. The test suites include 10 feed-guard, 53 Reel/media, 62 long-form/media, 7 Johannesburg cadence and 15 YouTube tests. Meta readiness failed because of the expired/invalid/revoked token; Facebook publisher was skipped. The check confirmed the Page ID, `PUBLISH_ENABLED` disabled, dry-run enabled and emergency stop active.
- PR #12 targets `main` directly, has no base-branch commits missing, and GitHub reports it mergeable. It remains a draft and has not been merged. Do not treat mergeability as release approval.
- Website items listed in the October snapshot (placeholder contact address/phone, privacy-policy and affiliate-disclosure review, mobile layout, embedded video playback, newsletter behaviour and checkout) were not rechecked or changed in this release. WordPress dashboard write access was not available. Keep those checks open until a current authenticated website review is completed.
- Public publishing remains disabled. No campaign is approved by this checklist, and no live post or video upload is claimed.


## Additional media intake verification — 12 November 2026

The available ChatGPT Library was searched for the previously supplied media. Four accessible files were materialized and technically inspected; they are intake candidates only, not approved production assets:

| File | Verified technical facts | Current decision |
|---|---|---|
| `Mongoose_dodges_cobra_attack_cb4adda4.mp4` | 4.032 s; 1280×720; H.264; AAC 48 kHz stereo; 24 fps; SHA-256 `2f4f5e82bc35119d4dde0fb223c55b105b77ca8e36d09713bd1bb57f1e0514d7` | HOLD — too short for a complete episode; original camera provenance, rights and human review are not evidenced |
| `Mongoose_pushes_himself_up_3466079b.mp4` | 4.032 s; 1280×720; H.264; AAC 48 kHz stereo; 24 fps; SHA-256 `c31a346787e7071a376ab4b139dd6a778bc69d25477cf5921c1a3398726b040e` | HOLD — too short; sampled frames visibly contain a “LAST LIGHT: 2 MIN” overlay; provenance, rights and human review are not evidenced |
| `MiniMax_2026-11-10_12_08_55_Man_With_Deep_Voice.mp3` | 8.464 s; MP3; mono; 44.1 kHz; SHA-256 `ce77791b99a6dea579b24295f1b0e963001151c55b3b1375c32184c8c7a5eb2b` | HOLD — short sample, not a complete narration; transcript/script match, usage rights and human listening review not evidenced |
| `MiniMax_2026-11-10_12_25_34_Man_With_Deep_Voice.mp3` | 7.262 s; MP3; mono; 44.1 kHz; SHA-256 `588745e9ad4208554c891976f09ec133c94f0e74ed1fa64a8ec2e48b71dfb157` | HOLD — short sample, not a complete narration; transcript/script match, usage rights and human listening review not evidenced |

The two Mongoose files were sampled visually but not approved as original camera recordings. A plausible wildlife image is not provenance evidence. The two MP3s were technically inspected for duration and format; no claim is made that their speech content or performance was human-reviewed. None of these four assets was added to a publishing campaign or uploaded.

The earlier 193.886621-second documentary export and corrected audio export remain recorded in the prior technical-QC history, but the Google Drive connector is currently disabled by administrator policy. The exact Drive source and final-QC files could not be fetched for a fresh visual, provenance or rights review in this pass. The prior technical decode/loudness result must not be mistaken for a new full-playback or rights approval.

## Newly corrected publisher/media defects

- All three Facebook adapters now fail closed when `EMERGENCY_STOP` is absent or active; the workflow defaults it to `true`.
- CI now runs the legacy feed-guard test suite and syntax-checks all three publishing adapters. Stale references to non-existent series test files were removed.
- Long-form and Reel media preflight now rejects files with no AAC audio stream, audio/video duration mismatch over 1.5 seconds, sample rates below 44.1 kHz, or non-mono/stereo channel layouts.
- Latest exact-head YouTube content workflow: [43306281569](https://github.com/clickerrish-art/nature-frontiers/actions/runs/43306281569), PASS, 16/16 tests on latest tested code head `b00d08e7dc4fa1f375f6af6efdd26eac59cf1b7b` (current PR head `d014abc003e1d317a439d869d3714b74451136a4` contains documentation-only updates).
- Latest publishing workflow: [43306281812](https://github.com/clickerrish-art/nature-frontiers/actions/runs/43306281812). Safety job PASS: complete `npm test` 152/152, 0 failed, 0 skipped; 23/23 fail-closed scenarios and 6/6 workflow wiring assertions. Meta readiness FAIL because the Page token is expired/invalid/revoked; publisher job SKIPPED.


## Library media inventory — 12 November 2026

The following available Library media files were materialized and inspected in this review. Technical inspection does not establish ownership, commercial-use rights, source provenance or editorial approval. **None is approved for publication.**

| File | Technical / visual findings | Decision |
|---|---|---|
| `Mongoose_dodges_cobra_attack_cb4adda4.mp4` | 4.032 s; 1280×720; H.264; AAC 48 kHz stereo; 24 fps; SHA-256 `2f4f5e82bc35119d4dde0fb223c55b105b77ca8e36d09713bd1bb57f1e0514d7`. Shows a mongoose facing/engaging a cobra. No camera-original source, provenance, licence or review record supplied. | HOLD — far too short for a Reel or documentary segment; original camera provenance and rights not evidenced |
| `Mongoose_pushes_himself_up_3466079b.mp4` | 4.032 s; 1280×720; H.264; AAC 48 kHz stereo; 24 fps; SHA-256 `c31a346787e7071a376ab4b139dd6a778bc69d25477cf5921c1a3398726b040e`. Frames visibly carry the overlay “LAST LIGHT: 2 MIN”. | HOLD — overlay contaminates the footage; source provenance, rights and human review not evidenced |
| `nature_frontiers_crocodile_reel_h264.mp4` | 10.000 s; 720×1280; H.264; 24 fps; no audio; SHA-256 `91abbcea857393cffe773ea0501d59899a5da31cf4dcebfea30ec69e806f46de`. Visual review identifies a stylized illustrated/animated crocodile, not camera footage. | PROHIBITED as documentary wildlife footage — animation is outside the approved original-camera-footage policy |
| `NOAA-spiny-lobster-shot-review-55s.mp4` | 55.000 s; 360×640; H.264; 15 fps; no audio; SHA-256 `d81220b7aad2c0e6db55f6b65d8e36b32ae09ce7f36885d80e35d00a90a6fd12`. | HOLD — no audio, low resolution/frame rate, not an approved export |
| `NOAA-california-spiny-lobster-short-review.mp4` | 55.235 s; 1080×1920; H.264; AAC mono 22.05 kHz; 30 fps; SHA-256 `c0735b95efa5a70fba2eba3a87cbacd2355c400288b320d97dd3190dce1cf280`. Frames show “REVIEW DRAFT — NOT FOR PUBLICATION” and NOAA credit. | HOLD — explicit review-only watermark; audio sample rate fails the 44.1 kHz minimum; source licence and editorial approval not evidenced |
| `NOAA-spiny-lobster-review-cut.mp4` | 64.000 s; 1280×720; H.264; 30 fps; no audio; SHA-256 `74fe43b1beae68574d2f75fd7b95737bde87be1ebad48451d4b50b94645b9181`. Frames show “REVIEW ONLY — NOT FOR PUBLICATION” and NOAA credit. | HOLD — explicit review-only watermark; no audio; not a 3–8 minute documentary or approved Reel |
| `MiniMax_2026-11-10_12_08_55_Man_With_Deep_Voice.mp3` | 8.464 s; MP3; mono; 44.1 kHz; SHA-256 `ce77791b99a6dea579b24295f1b0e963001151c55b3b1375c32184c8c7a5eb2b`. | HOLD — sample only; script match, commercial-use terms and human listening approval not evidenced |
| `MiniMax_2026-11-10_12_25_34_Man_With_Deep_Voice.mp3` | 7.262 s; MP3; mono; 44.1 kHz; SHA-256 `588745e9ad4208554c891976f09ec133c94f0e74ed1fa64a8ec2e48b71dfb157`. | HOLD — sample only; script match, commercial-use terms and human listening approval not evidenced |

The NOAA review cuts are visibly marked not for publication and are not original Nature Frontiers camera recordings. The crocodile file is animation. The Mongoose clips are too short and lack source provenance. These assets must not be assembled into a documentary or uploaded merely because their codecs decode successfully.

The earlier 193.886621-second Drive documentary and corrected audio export are not present in the accessible Library or current conversation files. The Google Drive connector is disabled by administrator policy in this session; historical technical-QC results remain historical and do not substitute for current playback, rights and human review.

## Daily Facebook publishing cadence — 12 November 2026

The daily quota now reflects the owner's operating target:

- Maximum **two Reels** per Africa/Johannesburg calendar day.
- Maximum **one feed post** per day. A long-form Facebook Page video consumes this same feed slot; it cannot be added on top of a separate text feed post.
- Maximum three total releases per Johannesburg calendar day.
- The existing approved posting minutes remain 11:00 and 16:00 Johannesburg time. Execution may begin at any second within the selected minute; the previous exact-second/millisecond requirement was removed because it made real workflow execution practically impossible.
- Manual GitHub dispatch selects exactly one adapter (reel, feed or video) per one-shot authorization. Two Reel dispatches and one feed dispatch are required to fill the daily quota; all live gates remain disabled by default.
- The feed publisher now checks the same daily capacity and stops if another campaign is in an uncertain publishing state, matching the long-form/Reel recovery behaviour.

Current Metricool queue read on 12 November 2026: 20 scheduled records; all 20 are drafts and all have autoPublish=false. All 20 target Facebook, and one static-cover product post is cross-posted to Instagram. No Reel is currently queued for release, and no post was modified in this inspection.

- Live publisher execution is now restricted to production branch `main`: both the workflow job and all three adapters reject implementation/pull-request branches. The fail-closed suite tests the production-branch allow path and wrong-branch rejection for each adapter.

- Feed-post approval is now hash-bound: the reviewer name, timestamp, explicit approval and release SHA-256 must match the exact caption and relevant campaign metadata. Any post-review caption or metadata change invalidates the approval.


## Live Metricool queue audit — 12 November 2026

A fresh read of Nature Frontiers brand `7545638` for 12 November–31 December 2026 (extended range includes the previous-day published item) returned 21 records:

- 20 are drafts; all 20 have `autoPublish=false`.
- 1 record is already published (11 November 2026, 17:00 Johannesburg time).
- All 21 records are Facebook `POST` type. One draft is cross-posted to Instagram and contains a static product-cover image.
- There are **zero Reels and zero long-form videos** in the current queue.
- The queue therefore does not meet the desired daily two-Reels-plus-one-feed target. The 20 drafts are not approved for auto-publishing and remain held.
- After the initial audit, 18 future-dated drafts were updated to add the owner-requested Nature Frontiers YouTube channel CTA. Read-back verified all 18 now contain `https://www.youtube.com/@naturefrontiers-life`; all remain `draft=true` and `autoPublish=false`, and their dates, networks and existing media were preserved.
- Two drafts dated earlier on 12 November were already past due at the time of update. They were left unchanged and not rescheduled, rather than backdated or silently moved.
- Eight drafts contain a relevant Selar product link. No Facebook caption contains a Safari affiliate URL. The YouTube description builder separately enforces all owner-supplied affiliate links in every YouTube video description; those affiliate links were not indiscriminately added to unrelated Facebook captions because that could look spammy.
- No post was published, approved or enabled for auto-publishing. The one already-published 11 November post was not changed.
