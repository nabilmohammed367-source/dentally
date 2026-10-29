# dentally

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_auC9p8PAFpwgmZZj1nJ6EYu4A36Y)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Live-mode access setup

The browser-only synthetic-data demo remains public when `NEXT_PUBLIC_DENTALOS_LIVE` is not `true`. Live mode is locked until Supabase Auth and a practice membership are configured.

1. Create a Supabase project and review its region, data-processing terms, and subprocessors for your intended use. Do not load patient data during setup.
2. In Supabase SQL Editor, run `supabase/migrations/20261020170000_practice_memberships.sql`, then `supabase/migrations/20261029100000_expand_practice_membership_ids.sql`.
3. Copy `.env.local.example` to `.env.local`, then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project. Keep the n8n key server-only; never use a Supabase service-role key in this app.
4. In Supabase Auth, require email confirmation and configure a production SMTP sender before inviting practice staff. Add the local and deployed callback URLs to the Auth redirect allow-list.
5. Set `DENTALOS_ALLOWED_PRACTICES` on the server to a comma-separated list of exact practice IDs that have already been provisioned and isolated in n8n. Do not use a wildcard. Create/confirm the practice owner's account at `/signup`. Then assign the owner to exactly one allowlisted practice in the Supabase SQL Editor:

   ```sql
   insert into public.practice_memberships (user_id, practice_id, role)
   select id, 'prac_riverside', 'owner'
   from auth.users
   where lower(email) = lower('owner@example.nl')
   on conflict (user_id) do update
   set practice_id = excluded.practice_id, role = excluded.role;
   ```

   Replace the example email and practice ID with the verified owner and approved practice. The SQL migration permits safe ID syntax; it does not create the practice, add it to the server allowlist, isolate its n8n data, or connect its PMS. These are separate provisioning steps.
6. Restart the app. Live mode requires both a confirmed account and an assigned membership. Unassigned accounts cannot read or trigger practice data.

This is an initial account and practice-access gate, not a complete production security review. The dashboard API restricts approval decisions and agent/automation/practice setting changes to `owner` and `admin` memberships; `staff` can use the other supported dashboard actions. API actions and payloads are allowlisted in the server. The n8n workflows still need independent tenant and record-level checks, and access-role isolation still needs end-to-end verification. The calendar feed, hosting, backups, and real-practice provisioning also need separate hardening before patient data is used.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
