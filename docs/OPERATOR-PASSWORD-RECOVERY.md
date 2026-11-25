# Owner-controlled operator password recovery

This procedure replaces the staging operator password without adding a public reset endpoint or transmitting a password through chat, GitHub, logs, or a URL.

## 1. Generate the hash locally

On a trusted computer with Node.js 20 or newer, check out the feature branch and run:

```sh
node scripts/nf-operator-password-hash.mjs
```

The script accepts the password twice with terminal echo disabled. It refuses piped input, enforces a 14-character minimum and 1024-byte maximum, creates a fresh 16-byte random salt, derives PBKDF2-SHA256 with 100,000 iterations and 32 output bytes, and verifies the generated value before printing only the encoded hash.

Do not save the password in shell history, a file, a password manager shared with others, or a chat. Keep the generated hash private too.

## 2. Update the staging Worker secret

In Cloudflare Dashboard, open the `nature-frontiers-staging` Worker, Production environment, Settings → Variables and Secrets. Replace the value of the existing `NF_OPERATOR_PASSWORD_HASH` **Secret** with the generated encoded hash. Do not add a differently named variable. Save and deploy the staging Worker.

The script deliberately does not call Cloudflare APIs and does not deploy anything.

## 3. Revoke existing sessions

After deployment, use the Cloudflare D1 console for the staging database only. Execute this single non-destructive statement:

```sql
UPDATE operator_sessions
SET revoked_at = datetime('now')
WHERE revoked_at IS NULL;
```

This invalidates existing operator sessions without deleting audit history or other records. Confirm the affected row count. Do not run this against rehearsal or production databases.

## 4. Verify

Open the staging operator console and sign in using operator ID `nf-staging-owner` and the new password. Confirm the dashboard loads, then sign out and sign in once more. Confirm the old password is rejected.

The Worker uses the same encoded format: `pbkdf2$100000$<32 hex salt>$<64 hex derived key>`.

## 5. Safety

Keep `dry_run=1`, `emergency_stop=1`, and `publishing_enabled=0`. This recovery does not connect Meta accounts or authorize publishing. Continue with Facebook OAuth only after successful operator login.

If the Cloudflare secret update or deployment fails, do not revoke sessions; restore the previous known-good configuration through Cloudflare's version controls and investigate.
