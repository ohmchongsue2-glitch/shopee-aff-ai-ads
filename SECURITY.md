# Security and access
All application pages and APIs require the administrator session, except /health and the login/bootstrap endpoints. No bypass or default password is available.
- Set APP_ORIGIN to the exact HTTPS origin.
- Set ADMIN_SETUP_TOKEN_HASH to the SHA-256 of a random 32-byte one-time setup token, and ADMIN_SETUP_EXPIRES to an epoch millisecond expiry. Only the hash is stored in deployment configuration. The setup endpoint closes permanently after admin-auth.json exists.
- The administrator chooses a password of 12–128 characters in /login.html; passwords are salted and hashed using asynchronous scrypt (N=32768, r=8, p=1). Do not enter passwords into source, logs, or chat.
- Session cookies are Secure, HttpOnly and SameSite=Strict with the __Host- prefix. Session bearer values are hashed before storage. Sessions normally expire after 12 hours, or 30 days when explicitly remembered. Password changes revoke other sessions.
- Every state-changing browser API request requires the exact origin, JSON, a valid session, and its CSRF token. Login and setup attempts and other requests are rate limited. Limits are process-local; this deployment uses one replica.
- SETTINGS_ENCRYPTION_KEY is a random 32-byte hex key stored only in private Railway variables. Settings migrate from legacy JSON to AES-256-GCM automatically. Keep this key with a secured backup: replacing it without a settings migration will make existing encrypted settings unreadable.
- All sensitive state remains outside public/ with restrictive file permissions. Tokens are excluded from public config and redacted from application API responses.
- The browser uses external same-origin scripts with CSP, frame denial, HSTS, MIME sniffing protection and a no-referrer policy. TLS is terminated by Railway; trust proxy is exactly one hop.
- Background Meta/Telegram monitoring runs server-side and does not depend on an administrator browser session.
- Logs record security event names, timestamps and hashed IP identifiers, never passwords or bearer tokens.
## Verification
Run npm test for anonymous access denial, CSRF, origin checks, bootstrap one-use enforcement, password hashing, settings encryption/migration, login limits, session restart persistence, revocation, ID validation, headers and mocked Meta integration. npm audit --omit=dev checks the pinned dependency tree.
## Recovery
Protect the Railway and GitHub administrator accounts with two-factor authentication. Retain the encrypted settings, administrator state and encryption key in a secured backup. An existing administrator can change their password on /account.html. For a lost password, use an authorized maintenance workflow with a backup; never open a public reset route or remove the authentication gate.
