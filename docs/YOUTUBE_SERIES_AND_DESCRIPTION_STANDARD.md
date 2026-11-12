# Nature Frontiers YouTube series and release standard

## Channel and format
- YouTube destination supplied by the owner: https://www.youtube.com/@naturefrontiers-life
- Long-form runtime: **3–8 minutes** (180–480 seconds), 16:9.
- Every long-form upload belongs to a named series and has a season and episode number.
- Each episode has a continuing story, a clear takeaway, a next-episode tease and a channel call to action.
- The series planner is in `data/youtube-series-season-1.json`; all six entries are concepts, not completed or approved videos.

## Hook before ad breaks
- Start the video with the strongest truthful hook. It is the first timeline segment, begins at 0:00 and lasts at least 8 seconds.
- Establish the story question and meaningful context before any creator-placed mid-roll opportunity. The release validator requires at least 60 seconds before a mid-roll and requires a reviewed natural narrative breakpoint.
- YouTube only permits mid-roll ads on monetized videos that are **8 minutes or longer**. Under the 3–8 minute policy, only an episode that reaches 8:00 is eligible; videos from 3:00 through 7:59 cannot have mid-rolls.
- Mid-roll slots are opportunities, not guaranteed ads. YouTube decides whether to serve an ad. Natural transitions and pauses are preferred; never interrupt an active animal encounter, a sentence, a critical reveal or the story payoff.
- Creators cannot control platform-served pre-roll ads. The hook must lead the first content frame after any pre-roll.
- Official guidance: https://support.google.com/youtube/answer/6175006

## Series structure
Every episode must include these ordered beats:
1. Hook.
2. Story setup and question.
3. Main story supported by accurate research and original footage.
4. Takeaway.
5. Next-episode tease.
6. Clear channel CTA.

Use a series title, season number and episode number in the description. Add previous/next episode links when those published URLs exist; never invent them.

## Mandatory description links
Use `buildYouTubeDescription()` from `scripts/youtube-content.mjs` or the `npm run build:youtube-description -- path/to/episode.json` CLI for every upload description. The builder inserts:
- The Nature Frontiers channel URL.
- Every product URL in `data/products.json`.
- All five owner-supplied Safari.com affiliate links with the original `a=GM26` tracking parameter.
- A paid-product notice and an affiliate commission disclosure.
- Series, season, episode, synopsis and next-episode tease.

The description validator fails if any required link or disclosure is missing. Do not shorten, rewrite or remove affiliate tracking parameters.

If the video itself contains a paid product placement, sponsorship, endorsement or other paid promotion, enable YouTube's native paid-promotion declaration in video details as well. A text disclosure in the description does not replace the platform setting. See https://support.google.com/youtube/answer/154235.

## Content, rights and release gates
- Use original, naturally realistic wildlife camera recordings only. Stock wildlife compilations, AI-generated wildlife video, synthetic encounters and animation presented as documentary footage are prohibited.
- Preserve original source files, provenance, ownership/licence evidence and asset hashes. Facebook long-form and Reel release approval must include video, script, voiceover, captions, thumbnail and metadata SHA-256 values; the recorded human-review hash set must match those exact final artefacts. Video and audio rights each need a recorded licence/ownership evidence reference. Remote publish receipts must confirm the exact uploaded video ID, the Nature Frontiers Page owner ID and an HTTPS permalink; a Reel may only link to a parent long-form video published by that same Page.
- Fact-check species-specific claims and ensure the narration matches what the footage actually shows.
- Do not stage, provoke, bait, chase, handle or otherwise disturb wildlife for footage.
- A plan cannot be marked approved unless original footage has a source reference and SHA-256, rights have a licence/ownership evidence reference, factual review has source references, and final editorial/metadata review has a named reviewer, timestamp, final-video SHA-256 and metadata SHA-256. A season cannot be approved while any episode remains unapproved.
- A mid-roll review must record the verified monetization eligibility evidence, exact channel ID, verifier and timestamp, and explicitly confirm that no protected animal behaviour, critical reveal or payoff is interrupted.
- Any previous/next episode URL must be a published HTTPS YouTube URL; unsafe or non-YouTube destinations are rejected. Titles are capped at YouTube's 100-character limit.
- Mid-roll eligibility requires a recorded verification for the exact Nature Frontiers channel ID, including the verifier and timestamp; a bare boolean is insufficient.
- The owner-supplied handle `@naturefrontiers-life` resolves publicly to a channel titled **Nature Frontiers** with the expected African-wildlife documentary description.
- **A connected-account mismatch is confirmed:** Metricool currently reports YouTube channel ID `UCSlkuPfHH78oGC1o418HV4w`, but that ID resolves publicly to **SonicVibes**, not Nature Frontiers. Do not use the Metricool YouTube connection for Nature Frontiers uploads or scheduling.
- YouTube publishing is explicitly disabled in `data/youtube-content-policy.json`. The public handle is resolved, but an authenticated Nature Frontiers YouTube connection is not available through the current Metricool integration.
- This repository change does not enable YouTube uploads, monetization, ad settings, public publishing or automatic scheduling. Those require a separate verified integration and owner-authorised account settings.

## Validation
Run:
```sh
node scripts/build-youtube-description.mjs content/youtube/wild-encounters-s01e01-description.json
npm run test:youtube-content
```

The YouTube content workflow runs the sample description builder explicitly and is triggered by changes to the sample input, builder, validator, tests, policy, catalogue, README and this standard.
