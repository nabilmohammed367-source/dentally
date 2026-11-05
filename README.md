# DentalOS

DentalOS is a Dutch dental-practice workflow prototype: a Next.js dashboard for six agents, with Supabase account and practice access and a local n8n backend. **Use synthetic data only.** It is not ready for real patients or unattended practice operation.

## Quick code review

1. Start with [`LOCAL-READINESS.md`](LOCAL-READINESS.md) for verified behavior and open gaps, then [`PILOT-PRIVACY-NOTES.md`](PILOT-PRIVACY-NOTES.md) for the data flow.
2. Review access boundaries in `lib/auth.ts`, `lib/dentalos-service.ts`, `lib/dentalos-api-policy.ts`, and `app/api/dentalos/`.
3. Run `npm install`, `npm run test:policy`, and `npm run build -- --webpack`. The tracked lockfile is for pnpm; if using pnpm, run `corepack pnpm install --frozen-lockfile` instead.
4. For the browser-only synthetic interface, run `npm run dev` and open `http://127.0.0.1:3000/`. Port 3001 may be used if 3000 is occupied.

The n8n workflow definitions, local SQLite database, voice-agent project, credentials, and backups are **not in this repository**. A clone cannot reproduce the connected six-agent workflow system by itself. The local demo can be shown by screen share; there is no public real-patient service.

## Connected local setup

Copy `.env.local.example` to `.env.local`. Set the Supabase project URL and publishable key, the server-only n8n webhook URL and key, and the exact provisioned practice IDs. Never commit `.env.local` or a service-role key. Apply the SQL migrations in `supabase/migrations/` in order. Configure confirmed Supabase Auth accounts and assign each user a single practice membership before enabling live mode. The app forwards authorized actions to n8n; the n8n workflows must also be installed and independently secured.

The code enforces dashboard roles and practice scoping, but a deployment still needs hosting, monitoring, backup restore, provider review, a real practice provisioning flow, messaging/phone delivery, and a safe connection or staff handoff to the practice's scheduling software. The exact limits and test results are in the readiness report.

## Context for reviewers

- Stack: Next.js 16, React 19, TypeScript, Supabase Auth, n8n webhooks.
- `main` may reflect the older v0 landing page. Review the `codex/dentalos-local-hardening` branch for the current local dashboard until the owner explicitly approves a merge.
- A GitHub or Vercel preview is a code preview. It does not connect to the local n8n instance and must not be treated as a production deployment.
