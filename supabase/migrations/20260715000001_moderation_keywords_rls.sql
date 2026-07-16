-- ---------------------------------------------------------------------------
-- Fix Supabase linter `rls_disabled_in_public`: moderation_keywords was
-- created (20260706000005) without RLS, and the default grants let anyone
-- holding the anon key read/insert/delete the keyword list.
--
-- No client ever queries this table — its only readers are the
-- flag_banned_message / flag_banned_event trigger functions, which are
-- `security definer` and run as the table owner, so RLS never applies to
-- them. Enabling RLS with zero policies (plus revoking the grants for
-- belt-and-braces) locks out anon/authenticated entirely while leaving the
-- keyword filter untouched. Manage the list via the SQL editor / service
-- role, as the original migration intended.
-- ---------------------------------------------------------------------------

alter table moderation_keywords enable row level security;

revoke all on table moderation_keywords from anon, authenticated;
