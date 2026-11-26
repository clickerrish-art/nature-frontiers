# Owner-controlled operator password recovery

This procedure replaces the staging operator password without adding a public reset endpoint or transmitting a password through chat, GitHub, logs, or a URL.

## 1. Generate the hash in the browser (no local installation or disk space)

Open the already-deployed helper over HTTPS:

`https://nf-operator-hash-helper.kajiboye44.workers.dev`

The helper's page computes the hash entirely in your browser using Web Crypto. The password is not sent to the helper Worker, Cloudflare, GitHub, or ChatGPT. It uses a fresh 16-byte random salt, PBKDF2-SHA256 with 100,000 iterations, and 32 output bytes. Enter the new password twice (minimum 14 characters, maximum 1024 UTF-8 bytes), generate the hash, and copy only the encoded hash.

Do not send the password or generated hash in chat, email, screenshots, or logs. Do not save the password in a file or shell history. The local Node.js script remains available as an alternative for an interactive terminal, but it is not required.

## 2. Update the staging Worker secret — do not deploy until bindings are checked

In Cloudflare Dashboard, open the `nature-frontiers-staging` Worker, Production environment, Settings → Variables and Secrets. Replace the value of the existing `NF_OPERATOR_PASSWORD_HASH` **Secret** with the generated encoded hash. Do not add a differently named variable.

Save the secret, but **do not deploy yet**. The currently active Worker version 42 has seven secret bindings and two D1 bindings. A later uploaded version 44 has an empty binding list. Before deployment, verify that the candidate version retains all seven expected secret binding names and both D1 bindings (`DB` and `BACKUP_DB`). If any binding is missing, stop and restore/reconfigure the complete binding set securely. Never deploy a candidate with missing secrets or database bindings. Secret values must not be copied into chat, GitHub, logs, or this document.

The browser helper does not call Cloudflare APIs and does not deploy anything.

## 3. Revoke existing sessions

Only after the complete candidate binding set has been independently verified and deployed, use the Cloudflare D1 console for the staging database only. Execute this single non-destructive statement:

```sql
UPDATE operator_sessions
SET revoked_at = datetime('now')
WHERE revoked_at IS NULL;
```

This invalidates existing operator sessions without deleting audit history or other records. Confirm the affected row count. Do not run this against rehearsal or production databases.

## 4. Verify

Open the staging operator console and sign in using operator ID `nf-staging-owner` and the new password. Confirm the dashboard loads, then sign out and sign in once more. Confirm the old password is rejected. The live deployed Worker must be checked against its exact Cloudflare version and binding inventory before treating login as passed.

The Worker uses the same encoded format: `pbkdf2$100000$<32 hex salt>$<64 hex derived key>`.

## 5. Safety

Keep `dry_run=1`, `emergency_stop=1`, and `publishing_enabled=0`. This recovery does not connect Meta accounts or authorize publishing. Continue with Facebook OAuth only after successful operator login.

If the Cloudflare secret update or deployment fails, do not revoke sessions; restore the previous known-good configuration through Cloudflare's version controls and investigate.
