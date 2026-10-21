# Nature Frontiers — Free Automation Starter

This branch prepares a free, review-first foundation for promoting the fixed Selar product catalogue.

## Safety status

- **Publishing is disabled.** This starter does not publish, schedule, or send messages to any social platform.
- No Zapier, paid Metricool API plan, new Supabase project, or paid service is required to run the catalogue validation.
- The catalogue is fixed in `data/products.json`; it does not discover or add new Selar products automatically.
- Product links and descriptions must be checked before public campaigns are approved.
- Never add passwords, access tokens, API keys, or other secrets to files or commits.

## What currently runs

A GitHub Actions workflow validates the product catalogue on a schedule and when catalogue/workflow files change. It only checks data quality and safe campaign rules. It does not contact social networks or Selar.

## Before any publishing automation is considered

1. Verify every Selar link opens the intended product and price.
2. Confirm which free, officially supported APIs are actually available for each social account.
3. Review each platform's current rules, media requirements, disclosure requirements, and rate limits.
4. Add credentials only as GitHub Actions repository secrets after access has been verified.
5. Keep publishing disabled until an explicit human review approves the exact workflow and a test plan.

## Current supported promotion approach

Create useful, search-intent-led educational content around the problems each product addresses. Avoid spam, repetitive cross-posting, misleading scarcity, guaranteed-income claims, fake endorsements, and copyrighted media without permission. Use clear descriptions and the correct product checkout link.

## Review this branch

This work is on the `automation-starter` branch, not the default branch. No posts have been published or scheduled by these files.
