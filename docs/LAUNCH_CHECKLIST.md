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
- [ ] Checkout flow, currency, product format, included deliverables, and any crossed-out/discount pricing have not been independently verified in this review. No test purchase was made.

## 2. Campaign review

For each draft in `data/campaigns.json`:

- [ ] Review the complete caption for factual accuracy, clarity, grammar, and fit with the product.
- [ ] Confirm the product URL in the caption matches the current catalogue URL.
- [ ] Remove unsupported claims, guaranteed results, fake endorsements, pressure tactics, or unverified product features.
- [ ] Confirm the caption is suitable for the Nature Frontiers audience and does not imply that unrelated online-income products are wildlife education products.
- [ ] Confirm relevant affiliate/commercial disclosures and platform requirements.
- [ ] Approve only the specific product and campaign after the above checks are complete.

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
