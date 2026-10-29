-- Replace the initial synthetic-practice allowlist with a safe identifier format.
-- The application still uses DENTALOS_ALLOWED_PRACTICES as an explicit server-side
-- allowlist; each ID must also exist in the n8n tenant data before membership assignment.
alter table public.practice_memberships
  drop constraint if exists practice_memberships_practice_id_check;

alter table public.practice_memberships
  add constraint practice_memberships_practice_id_check
  check (practice_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$');
