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
- [ ] Confirm affiliate/commercial relationship and required disclosures.
- [ ] Confirm Meta Page permissions and publishing configuration.
- [ ] Obtain owner approval for each specific product/campaign before any status change or publication.

Do not mark a product `approved`, a campaign `approved`, or a link verified unless the human checks were actually completed and documented.

## 3. Publishing safety

- [ ] Confirm GitHub repository variables remain `PUBLISH_ENABLED=false` and `PUBLISH_DRY_RUN=true`.
- [ ] Confirm the Meta Page ID and access token are valid, least-privilege credentials stored only in GitHub Actions secrets.
- [ ] Confirm the requested Meta permissions and the current Graph API version are supported for the intended Page.
- [ ] Review the publisher workflow and the one-campaign-per-run restriction.
- [ ] Run catalogue validation and publishing safety tests; inspect the actual job logs.
- [ ] Confirm no campaign is left in `publishing` after an ambiguous result; manually reconcile the Page and GitHub state before retrying.
- [ ] Authorise a specific first live post only after all reviews and a dry-run plan are complete.

A green workflow is not authorisation to publish. Do not enable live publishing as part of routine maintenance.

## 4. Website and channel checks

- [ ] Open the live WordPress site and check the home page, Videos, About, Shop, Blog, Affiliate Recommendations, and Contact pages.
- [ ] Fix any page-not-found errors and test all primary navigation links on desktop and mobile.
- [ ] Confirm embedded social feeds work without exposing private tokens.
- [ ] Confirm the YouTube channel link and all affiliate/product destinations are correct.
- [ ] Check the site's privacy, affiliate disclosure, and contact information pages.
- [ ] Verify analytics/measurement is configured only where consent and platform rules allow.
- [ ] Replace the visible homepage placeholder headline `THE ONLY ONE` with approved brand copy.
- [ ] Replace the placeholder phone number `(+1) 23456789` with a verified business contact or remove it.
- [ ] Repair or remove the newsletter form while it reports `Subscription form is not available at the moment`.

The public homepage was inspected on 21 October 2026 and showed the three visible issues above. Attempts to open several internal pages timed out, so their current status remains unverified. These checks require WordPress/platform access and are not proven by the GitHub catalogue validator.

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
- Live publishing must remain disabled until explicit human launch approval.
- The public WordPress homepage has visible placeholder/contact/newsletter issues; internal page checks timed out and need verification in WordPress.
