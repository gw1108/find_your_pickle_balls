-- Chat pivoted from Stream Chat to Supabase Realtime (PLAN.md §5, 2026-07-06).
-- Event chat is keyed by event id directly; the Stream channel pointer is dead.
-- (Column stays in the already-applied initial migration; dropped here instead.)

alter table events drop column stream_channel_id;
