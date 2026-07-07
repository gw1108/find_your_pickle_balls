# Your action list (human-only steps)

Phase 0 setup and the Phase 1 unblockers (migrations pushed, Austin venue
layer loaded, email confirmation off for dev) are **done** — 2026-07-06.
What's left, in order:

## 0. ~~Venue rename + top-up~~ — done 2026-07-06

Applied and verified via REST: 1,220 venues live, 661 renamed from their
containing park/school, generic names down to ~540 (no named parent in OSM).
(For future SQL files: the command is
`pnpm dlx supabase db query --linked --file <path>`.)

## 1. Whenever you want Google login (~20 min)

- [ ] **Enable Google sign-in** in Dashboard → Authentication → Providers →
  Google (create an OAuth client in Google Cloud Console; add
  `https://myqkjecfuqqjiknzqtbi.supabase.co/auth/v1/callback` as the redirect
  URI). Until then, the dev email/password sign-in on the app's sign-in screen
  covers all local testing.

## 2. Before any real beta users

- [ ] **Re-enable email confirmation** (Dashboard → Authentication → Sign In /
  Providers → Email) and set up **custom SMTP** (Authentication → Emails) —
  it's off right now purely as a dev convenience, and the built-in SMTP is
  rate-limited to ~2 emails/hour anyway.

## 3. Calendar these for later

- [ ] **LLC formation** at ~9 weeks before launch (PLAN.md §10 has the full
  week-by-week gate table: LLC → D-U-N-S → Apple org $99/yr + Play org $25).
- [ ] **Domain** — pickupsports.app is a placeholder in the code; buy the real
  domain (or tell Claude the actual name to search-replace) before the website
  or deep links go live.
- [X] **Apple Developer account** — signed up 2026-07-06. Unblocks the iOS
  milestone build, now scheduled at the **end of Phase 2** (PLAN.md §12).
  Note: if you enrolled as an *individual*, §10 still calls for an
  *organization* account before store launch (keeps your personal name off
  the listing) — Apple supports converting individual → org later using the
  LLC's D-U-N-S number, so nothing to redo now.
