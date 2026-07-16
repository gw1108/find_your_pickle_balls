# Your action list (human-only steps)

**What this file is:** the owner's punch-list — the queue of steps only a
human can do (interactive logins like `wrangler login`/`eas-cli`, dashboard
clicks, payments, live `db push`, physical-device tests). Agents hit one of
these, write the step here spelled out click-by-click, and continue with
whatever isn't blocked; the owner works the list top-to-bottom and then
prompts the next phase. Anything *not* listed here, Claude can do from the
agent shell.

**Instructions for agents maintaining this file:**

- **Queue, don't retry.** When a permission-gated action blocks you, add a
  section here with the exact commands/clicks (assume no prior context) and
  a `- [ ]` checklist line per outcome, then move on.
- **Verify, then delete.** When a section looks done (owner says so, or its
  checkboxes are ticked), verify it from the agent shell first — query the
  live DB, curl the endpoint, drive the rig — and only then **delete the
  entire section**. Completed work does not accumulate here; lasting facts
  go to the PLAN.md §12 status blocks (history), memory (rig gotchas,
  commands that worked), or code comments. If verification fails, keep the
  section and note what you observed instead.
- **Keep it ordered by when the owner should act** (next actionable first,
  "whenever" items last), and keep section labels stable — PLAN.md and past
  status blocks reference them (0a, 0b, …).

Everything through Phase 3's website deploys (migrations, venue layer,
push notifications, Edge Functions, the `pickup-worker` + the live
marketing site) is done and has been deleted per the rules above — see
the PLAN.md §12 status blocks for the history.

---

## 0d. iOS milestone (§9.1) — build 5 submitted; install + run the checklist

**Build 5 is good.** The build-4 launch crash was missing `EXPO_PUBLIC_*`
env vars in the EAS cloud build (`.env` is gitignored, so it never reached
the build servers, and `src/lib/supabase.ts` throws at startup without
`EXPO_PUBLIC_SUPABASE_URL`). You added the `env` block to `eas.json`'s
production profile, rebuilt, and submitted. Claude verified 2026-07-15 by
downloading build 5's IPA and grepping `main.jsbundle`: all three values
(Supabase URL, anon key, Stadia map style) are inlined, `CFBundleVersion` is
`5`. The crash cause is gone — 0d-0/0d-1/0d-2 are done and deleted per the
rules above. Your remaining steps:

### 0d-5. Fix Google sign-in redirect (2 dashboard fields, ~2 min)

You hit this on the iPhone 2026-07-15: after the Google consent screen,
Safari lands on an unopenable `localhost` page. Cause: the app asks
Supabase to redirect back to `pickup://auth-callback`, but that URL isn't
on the project's redirect allowlist, so Supabase falls back to its
**Site URL** — still the default `http://localhost:3000`. (Google → Supabase
worked fine; it's the final Supabase → app hop that's misconfigured.)

1. https://supabase.com/dashboard/project/myqkjecfuqqjiknzqtbi/auth/url-configuration
2. **Site URL**: replace `http://localhost:3000` with
   `https://find-your-pickle-balls.pickupsports.workers.dev` (any real
   fallback beats localhost; swap for the real domain later per item 3).
3. **Redirect URLs** → **Add URL** → `pickup://auth-callback` → Save.
4. Retry **Continue with Google** on the iPhone (no rebuild needed —
   this is all server-side).

- [ ] Site URL + redirect allowlist updated
- [ ] Google sign-in lands back in the app

### 0d-3. Install on your iPhone

1. On the iPhone: install **TestFlight** from the App Store, sign in
   with the same Apple ID.
2. On a browser: https://appstoreconnect.apple.com → **Apps** →
   **Pickup** → **TestFlight** tab.
3. The "Missing Compliance" flag should **not** appear —
   `ITSAppUsesNonExemptEncryption: false` is already set in app.json. If
   it shows up anyway: **Manage** → standard/exempt encryption → Save.
4. Under **Internal Testing** click **+** to create a group (name it
   anything), then **Add Testers** → add your own Apple ID.
5. The build appears in the TestFlight app on your phone within minutes
   → **Install**.

### 0d-4. Run the human checklist (§9.1)

Sign in with the dev email/password account (Sign in with Apple isn't
wired yet — that's expected; note anything *else* that's broken):

- [ ] **Continue with Google** works — first attempt 2026-07-15 dead-ended
      on `localhost` in Safari; fix is 0d-5 above (redirect allowlist),
      then retest.
- [ ] Map renders with venue + event pins; pan/zoom/rotate gestures feel right
- [ ] Sport/skill filters and the list toggle work
- [ ] One-tap join an event → lands in the group chat; send a message
- [ ] Chat cold-open: force-quit the app, reopen straight into a thread
- [ ] Push arrives on the iPhone (have Claude send a message from an
      emulator account to a channel you're in, or ask Claude to fetch
      your iPhone's token from `push_tokens` for a direct test send)
- [ ] Tapping the push deep-links into the correct thread
- [ ] Invite link: open `https://pickup-worker.pickupsports.workers.dev/e/653afb78-36c3-4851-9503-74d7e04b82cb`
      in Safari → "Open in the Pickup app" → lands on the
      event screen
- [ ] Geofenced check-in prompt + venue sheet (GPS-spoof isn't possible
      on a real phone — only test if you're physically near a venue,
      otherwise skip)
- [ ] Report + block flows work; blocked user's content disappears
- [ ] Account deletion flow (use a throwaway account, not your main one)

File anything broken as a note to Claude — iOS-specific bugs batch here
per §9.1 rather than interrupting the Android loop.

- [ ] Build 5 installed via TestFlight and launches without crashing
- [ ] Checklist run; failures noted

---

## 2b. Lock down the Firebase Android API key (~10 min, console)

GitHub secret-scanning alert #1 flagged `AIzaSy…O6FIU` in
`apps/mobile/google-services.json` (project `pickupsports-61c29`, package
`app.pickupsports.mobile`). This is a **Firebase Android client key** — it
ships inside the APK by design and is *not* a secret, so no rotation / git
history scrub is needed. BUT: from the agent shell it currently probes as
**unrestricted** — server-side requests with no Android package/cert
headers passed Google's key gateway (reached the backend, got
`CONFIGURATION_NOT_FOUND`, not an app-blocked 403). It should be locked to
the app. Do these in the console, then tell Claude to add the gitleaks
allowlist entry and dismiss the GitHub alert:

1. **Restrict the key to the Android app.**
   https://console.cloud.google.com/apis/credentials?project=pickupsports-61c29
   → click the Android key → **Application restrictions** → **Android
   apps** → add package `app.pickupsports.mobile` + the app's SHA-1
   fingerprint (debug and release). Get SHA-1 via
   `cd apps/mobile/android && ./gradlew signingReport` (or from the Play
   Console app-signing page for the release cert).
2. **Restrict the key to only the APIs you use** (same page → **API
   restrictions** → Restrict key → select Identity Toolkit / Firebase
   Installations / whatever the app actually calls).
3. **Enable App Check** (this is the real data-access guard, not the key):
   https://console.firebase.google.com/project/pickupsports-61c29/appcheck
   → register the Android app with **Play Integrity** → then **enforce**
   App Check on Firebase Auth + any Firestore/RTDB/Storage/Functions the
   app uses.

- [ ] Android app + SHA-1 restriction added to the key
- [ ] API restrictions set on the key
- [ ] App Check registered and enforced
- [ ] Told Claude to add gitleaks allowlist + dismiss GitHub alert #1

---

## 2. Before any real beta users (don't skip)

Email confirmation is currently **off** purely as a dev convenience —
anyone can sign up with a fake email. Before ambassadors/beta testers:

1. Supabase Dashboard → **Authentication** → **Sign In / Providers** →
   **Email** → re-enable **Confirm email**.
2. Set up custom SMTP (built-in sender is rate-limited to ~2 emails/hr):
   **Authentication** → **Emails** → **SMTP Settings** → enable custom
   SMTP. Easiest provider: Resend (resend.com, free 3k emails/mo) —
   create an account, verify your sending domain (needs the real domain,
   see item 3), copy host/port/user/password into the Supabase form.

- [ ] Email confirmation re-enabled
- [ ] Custom SMTP configured

---

## 0e. Phase 3 website — deployed; leftovers (whenever)

0e-1 (waitlist migration), 0e-2 (worker deploy + secrets), and 0e-3
(website Worker + waitlist round trip) are all **done and verified**
2026-07-07: the site is live at
`https://find-your-pickle-balls.pickupsports.workers.dev` (git-connected,
rebuilds on every push to `main`) and the waitlist form round-trips into
Supabase. Only "whenever" items remain:

- [ ] Cleanup whenever: Supabase Dashboard → SQL editor →
  `delete from waitlist where email like 'agent-verify-%@example.com';`
  (test rows from Claude's live round-trip verification).

### 0e-4. Deep-link placeholders (whenever the values exist — no rush)

Universal links stay dormant until these three placeholders get real
values; the app + site work fine without them:

- [x] `apps/web/public/.well-known/apple-app-site-association`: replace
  `TEAMID` with your Apple Team ID — done 2026-07-13 (Team ID
  `NL489DLC24`, membership activated).
- [ ] `apps/web/public/.well-known/assetlinks.json`: replace the SHA-256
  placeholder — after the first production Android build run
  `npx eas-cli credentials` (Android → production → Keystore) and copy the
  **SHA256 Fingerprint**, or later use Play Console's App Signing page.
- [ ] `apps/worker/src/index.ts` + `apps/web/src/layouts/Base.astro`:
  swap the commented `apple-itunes-app` meta (`app-id=TODO`) for the real
  App Store id once the app is listed.

---

## 3. Calendar these for later

- [ ] **LLC formation** at ~9 weeks before launch. PLAN.md §10 has the
  full week-by-week gate table: LLC + EIN + bank account → D-U-N-S number
  (do first, longest wait) → Apple Developer *org* account ($99/yr) +
  Play Console org ($25 once). The org accounts keep your personal
  name/address off the store listings and skip Google's 12-tester gate.
  (Your individual Apple Developer account from 2026-07-06 converts to an
  org account using the LLC's D-U-N-S number — nothing to redo now.)
- [ ] **App Store name** — "Pickup" was already taken on App Store
  Connect, so the app is listed there as the placeholder **"Pickup
  (668053)"**. Before the first *public* App Store release, pick a real
  name: appstoreconnect.apple.com → My Apps → the app → **App
  Information** → **Name**. Non-blocking until then — TestFlight testers
  see the display name from `apps/mobile/app.json`, not this listing
  name. If the new name differs from "Pickup", tell Claude so the
  in-app branding (`app.json` `name`, website copy) gets updated to
  match.
- [ ] **Domain** — `pickupsports.app` is a placeholder in the code; buy
  the real domain (or tell Claude the actual name to search-replace)
  before deep links or SMTP (item 2) go live. Then: add a custom domain
  to the `find-your-pickle-balls` Worker (rename it to something nicer
  like `pickup-web` in its dashboard Settings first if you care — tell
  Claude so `apps/web/wrangler.toml` stays in sync), add `pickup-worker`
  routes for `<domain>/e/*`, `/admin*` and `/waitlist*` (then the
  `PUBLIC_WAITLIST_ENDPOINT` build variable can go away), and restore
  `SITE_ORIGIN` in `apps/worker/wrangler.toml` (grep for `TODO(domain)`).
