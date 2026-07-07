# Your action list (human-only steps)

Phase 0 setup and the Phase 1 unblockers (migrations pushed, Austin venue
layer loaded, email confirmation off for dev) are **done** — 2026-07-06.
What's left, in order:

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
- [ ] **Apple Developer account** — only needed at the first iOS milestone
  build (end of Phase 1), not now.
