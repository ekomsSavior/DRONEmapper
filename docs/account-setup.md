# Scanner accounts

The public map and local scanner work without an account. Accounts make optional community sharing easier.

For your own Cloudflare deployment:

1. Run npm ci and node scripts/build-account.mjs.
2. Create a D1 database with npx wrangler d1 create dronemapper-accounts. Put its ID in your Wrangler config’s AUTH_DB binding.
3. Apply migrations/0001_accounts.sql with npx wrangler d1 migrations apply dronemapper-accounts --remote.
4. Set AUTH_ORIGIN to your HTTPS map origin. Generate a private random secret of at least 32 characters and enter it through npx wrangler secret put AUTH_SECRET.
5. Configure transactional email. Cloudflare Email Sending uses AUTH_MAIL_PROVIDER="cloudflare" and a send_email binding named AUTH_EMAIL. Set AUTH_FROM to your authenticated sender. Cloudflare requires Workers Paid for arbitrary recipients. Resend is also supported using AUTH_MAIL_PROVIDER="resend" and a secret named AUTH_MAIL_KEY.
6. Enable AUTH_ENABLED="true" only after mail delivery works, then deploy. Keep the AccountGuard Durable Object migration and AUTH_EDGE binding.
7. For a forked Android app, change DeviceConnection.ORIGIN to your website and rebuild. Manual custom-map keys remain supported.

Email forwarding receives replies; it cannot replace an outbound sender. Never put account secrets, signing keys, SMTP passwords or administrative node credentials in the app or repository.

Accounts use Better Auth, salted scrypt, verified emails, secure HttpOnly cookies, same-origin requests, optional TOTP and one-use recovery codes. Device approval uses an expiring code plus a private proof held by the app. Users can revoke individual nodes. Default public attribution is anonymous; display names are unverified nicknames and require explicit opt-in.

The signup cap and request/mail budgets are enforced on the server, including an atomic database constraint. Public errors stay generic. These controls reduce abuse; they do not replace Cloudflare’s network defenses. An IP is a network address, not a person. Rotate AUTH_SECRET carefully: it signs sessions and pseudonymizes signup IPs.

Run npm test for isolated account and node integration tests. Running node scripts/preview-account.mjs opens an isolated local preview on localhost:8784; it captures test mail locally and never sends it. Do not deploy the preview or enable AUTH_LOCAL_TEST/AUTH_TEST_MAIL in production.

Church of Malware · saviorSEC.

Abandoned, unverified registrations expire after 24 hours. Verified accounts are retained. The scheduled task also removes expired authentication state.
