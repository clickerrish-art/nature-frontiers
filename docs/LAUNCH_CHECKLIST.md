# Nature Frontiers launch checklist

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
- [ ] Run catalogue validation and publishing safety tests; inspect the actual job logs.
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
- [ ] Blog page timed out during the public content check; recheck in a normal browser before treating it as broken.
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

## Current known status (21 October 2026)

- Catalogue validation run #10: successful on `main`, commit `9a9fa33` after PR #5 was merged.
- PR #5 updated the GitHub Actions workflows to Node.js 24-compatible checkout/setup-node actions and scoped write permission to the gated publisher job.
- Six products exist and all have catalogue URLs; all remain `review-required`.
- Six Facebook campaigns exist and all remain `draft`.
- GitHub Pages deployment for commit `4b95f6700f277deb8ff1ea7641f928f2c8b063e6bc` succeeded on 21 October 2026 (Actions run [39626441552](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39626441552); build, deploy, and status-report jobs all succeeded).
- Publishing safety workflow run [39617135121](https://github.com/clickerrish-art/nature-frontiers/actions/runs/39617135121) passed safety tests and skipped the Facebook publisher; this did not publish any campaign.
- The publishing workflow now requires both repository opt-in and a separate per-run manual authorization; scheduled runs are forced off. The repository's actual secret/variable values and Meta Page permissions remain unverified.
- All six draft captions now include a paid-product promotional disclosure, enforced by both catalogue validation and the publisher adapter. A separate affiliate-commission disclosure is still needed if these links earn commissions.
- Live publishing must remain disabled until explicit human launch approval.
- Homepage, Videos, About, Shop, Educational Bundles, Teacher Resources, Conservation, Affiliate Recommendations, and Contact pages were reached through the live site's navigation. The Blog page timed out in the content check. Contact page shows an apparent placeholder address; Shop footer shows an apparent placeholder phone number. Mobile layout, embedded YouTube playback, privacy/affiliate disclosures, and checkout remain unverified. The owner reports the newsletter works; do not change it based on crawler output.
