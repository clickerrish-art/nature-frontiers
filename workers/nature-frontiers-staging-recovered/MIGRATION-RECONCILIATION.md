# Staging migration reconciliation — read-only evidence

Captured: 2026-11-25 (UTC)

## Scope and safety

This report reconciles the accessible Git history, the checked-in migration files, the recovered deployed-source snapshot, and read-only Cloudflare D1 metadata for **staging only**.

- Repository: `clickerrish-art/Nature-Frontiers`
- Branch: `codex/nf-durable-publisher-api`
- Branch HEAD at inspection: `90be353d509c5444be4b4f473eba024f8dd07936`
- Staging Worker: `nature-frontiers-staging`, active version 25.
- Staging D1 ID: `89be73af-ebaf-4c19-b75a-9871adb8ba3c` (from the recovered acceptance register).
- No SQL writes, migrations, ledger edits, Worker deployments, secret changes, or production operations were performed.
- The D1 queries in this inspection were SELECT-only. Cloudflare reported `changed_db=false` and `rows_written=0`.

## Direct staging observations

Read-only Cloudflare D1 query results:

1. `nf_schema_migrations` contains exactly one row:
   - `0009_meta_token_encryption.sql`
   - `applied_at = 2026-11-25 09:55:01`
2. `sqlite_master`, excluding platform-managed `_cf_KV` and SQLite internal names, reports:
   - 25 tables
   - 19 indexes
   - 31 triggers

The checked-in `schema.snapshot.sql` contains the same 25/19/31 application-object inventory and is recorded as a read-only schema snapshot, not an executable migration. The snapshot explicitly excludes application row data and platform-managed `_cf_KV`.

## Git evidence

At the inspected branch HEAD, the only numbered SQL migration files in the repository tree are:

| File | Git blob SHA | What the file defines |
|---|---|---|
| `0001_initial_schema.sql` | `04ce4ae1e906dca50d797f5802b7917218a39d51` | `content_items`, `approvals`, `audit_events`, `content_targets`, `media_rights`, `publication_attempts`, plus two indexes |
| `0002_meta_webhook_events.sql` | `9827db44a77c85e3d26599476c1f07dd77237f83` | `meta_webhook_events` and its received-at index |
| `0003_media_evidence.sql` | `3b80b233eab16311933fa773c2cbc6170f654b57` | `media_evidence` |
| `0004_review_evidence.sql` | `5393b44273a582d2f670d64e142e7b937a419c0d` | `review_evidence` |

The migration directory path history returns four commits, corresponding to these files. No `0005` through `0009` SQL source files are present in the inspected branch tree. Inspected additional accessible refs (main and the open PR branches for PRs 11, 26 and 28) did not reveal a complete 0005–0009 migration set. This is evidence about the inspected refs, not proof that no copy exists in an inaccessible repository, deleted ref, local checkout, artifact, or external backup.

The `0001` file itself says it was reconstructed from a read-only production D1 schema inspection on 2026-11-21. It should not be treated as proof of the original historical migration authoring event or as an authoritative staging migration baseline.

## Object-level reconciliation

### 0001 and 0002

The seven tables defined by 0001/0002 are present in the staging snapshot:

- `content_items`
- `approvals`
- `audit_events`
- `content_targets`
- `media_rights`
- `publication_attempts`
- `meta_webhook_events`

Their existence is consistent with the checked-in files, but object presence alone does not prove which exact migration execution created them or whether later DDL altered them. In particular, staging `content_items` includes `campaign_id`, which is not defined by 0001.

### 0003 and 0004

The checked-in files define `media_evidence` and `review_evidence`, respectively. Neither table appears in the captured staging schema. The deployed staging source instead queries `media_assets`, `media_rights_evidence`, and `approval_receipts`.

This is a material schema-generation divergence. The available evidence does not identify whether 0003/0004 were never applied to staging, were replaced by a later design, or were removed by an unlocated migration. Do not apply 0003/0004 to staging merely because the files exist.

### 0005 and 0006

No source files or ledger entries were found in the inspected refs. Their intended purpose and whether they ever existed cannot be established from current evidence. Do not infer their contents from neighboring migration numbers.

### 0007 and 0008

No original source files or ledger entries were found in the inspected refs. The deployed staging schema contains the later-generation structures used by the recovered Worker, including:

- `campaigns`, `content_revisions`, `content_audit_events`
- `media_assets`, `media_rights_evidence`
- `approval_receipts`
- `schedule_slots`, `worker_runs`
- `system_controls`
- `oauth_states`, `operator_sessions`, `login_rate_limits`
- `webhook_delivery_events`, `audit_chain`
- `analytics_snapshots`, `backup_records`

The presence of these objects establishes current schema state, not the migration number or exact SQL that created them. The earlier recovered acceptance record associates 0007/0008 effects with present staging objects, but without the original files or ledger records that attribution remains unverified.

### 0009

The staging ledger records `0009_meta_token_encryption.sql` as applied at 2026-11-25 09:55:01, but the corresponding source file is absent from the inspected refs.

The staging `meta_connections` definition includes `access_token_ciphertext`, `access_token_nonce`, and `token_key_version`, which are consistent with the migration name. It also includes `instagram_identity_verified_at` and `page_tasks_json`. Without the original 0009 SQL, do not assume all five columns were added by 0009 or infer its exact statements.

## Unexplained schema surface

The two available base migrations (0001/0002) define seven tables and three indexes in total. The live application schema has 25 tables and 19 indexes, plus 31 triggers; 0003/0004 define two additional tables that are absent from staging. Thus the checked-in migration set does not explain most of the live staging object inventory. The snapshot is an accurate state capture, not a substitute for missing migration lineage.

## Reconciliation conclusion

**Status: BLOCKED — historical migration lineage incomplete.**

Established:
- Staging ledger currently contains only the 0009 row.
- The live staging application schema inventory is 25 tables, 19 indexes, 31 triggers.
- The inspected durable-publisher branch contains migrations 0001–0004; a separate PR #32 branch contains an incompatible 0005 educational-story migration.
- 0003/0004 tables are absent from staging.
- Recovered staging Worker source uses a later schema generation that differs from the checked-in 0003/0004 schema.

Not established:
- Original SQL or authoritative commit provenance for the staging chain's 0005–0009; the recovered PR #32 0005 is an incompatible schema-generation candidate, not staging provenance.
- Whether 0005/0006 ever existed.
- Exact SQL and intended object ownership for 0007/0008.
- Exact statements in 0009, or the provenance of every token/identity column.
- A complete, ordered migration chain that can safely reproduce staging from an empty D1 database.

## Required next evidence before any migration write

1. Search any remaining accessible branches, tags, PR refs, GitHub artifacts, deployment bundles, local backups, and operator-held source archives for original 0005–0009 files and their commit SHAs.
2. Obtain the exact deployed D1 schema and migration ledger export as read-only evidence, retaining a checksum and timestamp. Keep application data out of a schema-only export.
3. Recover the original migration SQL and verify its ordering and checksums against the deployed schema. Do not manufacture historical ledger entries.
4. If original files cannot be recovered, obtain explicit owner approval for a separately versioned **forward-reconciliation** plan. It must describe current state and safe transitions without pretending to be the missing historical migrations.
5. Test any approved forward plan against a disposable local D1 database first, including constraints, triggers, indexes, and data-preservation checks. Do not test by applying it to active staging.

Until those conditions are met, keep staging and production databases unchanged and keep publishing disabled, dry run enabled, and the emergency stop active.


### Newly recovered 0005 candidate — not part of the staging migration chain

A full scan of all 30 current branch heads found one additional numbered SQL file on the PR #32 head branch:

- Path: `workers/nature-frontiers-publisher/migrations/0005_educational_story.sql`
- Branch: `codex/nf-original-camera-only-20261121`
- Blob SHA: `47fac90f17891667f8b6335ef80c54cc45966933`
- Introducing commit: `4a579cec6a3ae17e774532e45ceed5e0623451bf`
- Commit message: `Add persisted educational story approval binding`
- Commit time: `2026-11-21T19:12:03Z`
- PR: [#32](https://github.com/clickerrish-art/Nature-Frontiers/pull/32)

Its SQL adds `educational_story_json` and `educational_story_sha256` to `content_items`, and `educational_story_sha256` to `review_evidence` and `approvals`, then creates `idx_approvals_story_binding`.

This is an authentic Git-tracked migration candidate with identifiable provenance, but it is **not** an original 0005 migration for the current staging schema generation:
- It depends on `review_evidence`, which does not exist in staging.
- Staging's `content_items` currently has only the ten columns returned by read-only `PRAGMA table_info(content_items)`; neither educational-story column is present.
- The staging Worker generation uses `media_assets`, `media_rights_evidence`, and `approval_receipts`, not the `media_evidence` / `review_evidence` generation used by this migration branch.
- The branch's base is PR #26 head `dec6a1075c01b5b20a87f47cfec130c4a972123e`, whose tree contains only `0002_meta_webhook_events.sql`; this does not establish it as a continuation of the staging migration chain.

Therefore, preserve this file as provenance for the separate durable-publisher/educational-story schema generation. Do not apply it to staging, relabel it as the missing staging 0005, or use its sequence number to infer 0006–0009.

## Expanded repository and artifact search

The read-only scan inspected all 30 branch heads returned by the repository branches endpoint, all 27 pull requests returned by the repository PR endpoint (including closed PRs via their retained refs where present), the available PR head/merge refs, and all 100 most recent workflow runs plus the next page. The numbered migration files found across branch trees were 0001–0004 on the durable-publisher branch and the distinct 0005 candidate above on PR #32's branch. No 0006, 0007, 0008, or 0009 SQL file was found in those branch trees.

The repository tags endpoint returned no tags, the GitHub releases endpoint returned no releases, and checked workflow runs for validation did not retain artifacts (artifact listings returned zero for sampled runs). This does not prove no external deployment bundle, expired artifact, deleted ref, local checkout, operator backup, or separately permissioned repository copy exists.

