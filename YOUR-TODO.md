# Your action list (human-only steps)

Phase 0 setup, the Phase 1 unblockers, and the Phase 2 unblockers (0a, 0a½)
are **done** — history at the bottom. What's left, in the order you should
do it. Every step below is spelled out click-by-click; anything not listed
here, Claude can do from the agent shell.

---

## 0b. Finish push notifications — DONE 2026-07-07 ✓

Service-account key uploaded and assigned for FCM V1, then verified
**end-to-end on the rig**: real FCM delivery to a backgrounded app
(notification rendered "Pickup · Sunset · Player: Real push test…"),
and tapping it deep-linked straight into the Sunset thread. Nothing
left to do here. (Rig gotcha discovered on the way: booting the
emulator with `-no-snapshot-save` discards app installs on exit — the
delivery failures were a reverted stale APK, not a config problem.)

<details><summary>Original instructions (kept for reference)</summary>

**State as of 2026-07-07:** `google-services.json` is in the app and the
client half is fully verified — the rebuilt dev build registered a real
`ExponentPushToken` into `push_tokens` on sign-in. A test send through
Expo's push API returned `InvalidCredentials`, which means exactly one
thing is missing: Expo's servers don't yet have permission to talk to
your Firebase project. That permission is a "service account key" (a JSON
file) that you download from Firebase and upload to Expo (EAS). Steps:

### 0b-1. Download the service account key from Firebase

1. Open https://console.firebase.google.com and sign in with the Google
   account you used to create the Firebase project (the one that produced
   `google-services.json` — its Android app is `app.pickupsports.mobile`).
2. Click the project to open it.
3. Click the **gear icon** next to "Project Overview" (top-left) →
   **Project settings**.
4. Go to the **Service accounts** tab (top of the page).
5. Make sure **Firebase Admin SDK** is selected in the left pane, then
   click the blue **Generate new private key** button → confirm
   **Generate key** in the dialog.
6. A file like `<project-name>-firebase-adminsdk-xxxxx.json` downloads.
   **This file is a secret.** Leave it in `Downloads` — do NOT move it
   into the repo. You'll just point the upload tool at it.

### 0b-2. Upload the key to EAS

Open a terminal (regular PowerShell is fine) and run, one at a time:

```sh
cd C:\GameDev\find_your_pickle_balls\apps\mobile
npx eas-cli login
```

- Log in with your Expo account (the project lives under the
  **gw1108s-team** org — use whatever account owns that).

```sh
npx eas-cli credentials
```

Then walk the interactive menu:

1. **Select platform** → `Android`.
2. **Which build profile?** → `development` (the Google Service Account
   is project-wide, so any profile works — pick development).
3. In the actions menu choose **Google Service Account** (it may be
   worded "Manage your Google Service Account Key for Push Notifications
   (FCM V1)").
4. Choose **Set up a Google Service Account Key for Push Notifications
   (FCM V1)** → **Upload a new service account key**.
5. It scans for JSON keys and/or asks for a path — give it the full path
   to the file you downloaded, e.g.
   `C:\Users\georg\Downloads\<project-name>-firebase-adminsdk-xxxxx.json`.
6. When it confirms the key is assigned, exit the menu (Ctrl+C is fine).

### 0b-3. Verify it worked (~30 sec)

Paste this into any terminal:

```sh
curl -s -X POST https://exp.host/--/api/v2/push/send -H "Content-Type: application/json" -d "{\"to\":\"ExponentPushToken[CKQ1wcAIlz3OwlGwp7Ojus]\",\"title\":\"Push test\",\"body\":\"it works\",\"channelId\":\"chat\"}"
```

- **Before** the upload this returned `"error":"InvalidCredentials"`.
- **After** the upload it should return `{"data":{"status":"ok",...}}`.
- That token belongs to the throwaway `pushtest@pickup.dev` account on
  the Medium_Phone emulator (currently shut down, so the message won't
  render anywhere — `status: ok` is the success signal).

- [X] Key downloaded from Firebase (0b-1)
- [X] Key uploaded via `eas credentials` (0b-2)
- [X] Test send returns `status: ok` (0b-3)
- [X] End-to-end delivery + deep-link verified on the rig (2026-07-07)

</details>

---

## 0d. iOS milestone (§9.1) — MOVED TO PHASE 3

**Blocked 2026-07-07:** the Apple Developer Program enrollment payment is
still pending (EAS failed with "no team associated with your Apple
account" — that resolves itself when Apple activates the membership).
Decision: Phase 2 closes Android-complete; this milestone rides along
with Phase 3 instead.

- [ ] **Wait for the "Welcome to the Apple Developer Program" email**,
  then run the steps below (they're unchanged and pick up where the
  failed attempt left off — your Apple session is cached, no 2FA again).

Goal: the first iOS build of the app, on your physical iPhone, with a
human pass over the checklist. Per PLAN.md the route is an EAS cloud
build → TestFlight. Expect ~30–60 min of elapsed time, most of it
waiting on Apple.

### 0d-1. Kick off the iOS build

```sh
cd C:\GameDev\find_your_pickle_balls\apps\mobile
npx eas-cli build --platform ios --profile production
```

First-run prompts, in the order they appear:

1. **"Do you want to log in to your Apple account?"** → Yes → sign in
   with the Apple ID from your Apple Developer enrollment (2026-07-06).
   Approve the 2FA prompt on your iPhone.
2. **Bundle identifier** — it will register `app.pickupsports.mobile`
   on the Apple Developer portal. Accept.
3. **"Generate a new Apple Distribution Certificate?"** → Yes (EAS
   creates and stores it for you).
4. **"Generate a new Apple Provisioning Profile?"** → Yes.
5. **Push Notifications key (APNs)** — if it asks to set one up → **Yes**
   (this is the iOS equivalent of what you just did for FCM; EAS manages
   the key). If it doesn't ask, fix it afterwards with
   `npx eas-cli credentials` → iOS → Push Notifications → set up.
6. The build queues in the cloud (~15–25 min). You can watch the link it
   prints, or just wait for the terminal to finish. This uses 1 of your
   15 free iOS builds this month.

### 0d-2. Submit the build to TestFlight

```sh
npx eas-cli submit --platform ios --latest
```

1. It asks to log into App Store Connect — same Apple ID.
2. **"No App Store Connect app found — create one?"** → Yes.
   - Name: `Pickup` (placeholder is fine, it's not public until release)
   - Language: English (U.S.), SKU: accept the default.
3. Wait for "Submitted". Then Apple processes the binary for ~5–30 min.

### 0d-3. Install on your iPhone

1. On the iPhone: install **TestFlight** from the App Store, sign in
   with the same Apple ID.
2. On a browser: https://appstoreconnect.apple.com → **Apps** →
   **Pickup** → **TestFlight** tab.
3. If it flags "Missing Compliance" on the build: click **Manage** →
   the app **does** use encryption (HTTPS only) → select "standard
   encryption / exempt" → Save.
4. Under **Internal Testing** click **+** to create a group (name it
   anything), then **Add Testers** → add your own Apple ID.
5. The build appears in the TestFlight app on your phone within minutes
   → **Install**.

### 0d-4. Run the human checklist (§9.1)

Sign in with the dev email/password account (Sign in with Apple isn't
wired yet — that's expected; note anything *else* that's broken):

- [ ] Map renders with venue + event pins; pan/zoom/rotate gestures feel right
- [ ] Sport/skill filters and the list toggle work
- [ ] One-tap join an event → lands in the group chat; send a message
- [ ] Chat cold-open: force-quit the app, reopen straight into a thread
- [ ] Push arrives on the iPhone (have Claude send a message from an
      emulator account to a channel you're in, or use the 0b-3 curl with
      your iPhone's token — ask Claude to fetch it from `push_tokens`)
- [ ] Tapping the push deep-links into the correct thread
- [ ] Geofenced check-in prompt + venue sheet (GPS-spoof isn't possible
      on a real phone — only test if you're physically near a venue,
      otherwise skip)
- [ ] Report + block flows work; blocked user's content disappears
- [ ] Account deletion flow (use a throwaway account, not your main one)

File anything broken as a note to Claude — iOS-specific bugs batch here
per §9.1 rather than interrupting the Android loop.

- [ ] Build submitted and installed via TestFlight
- [ ] Checklist run; failures noted

---

## 0c. Admin moderation queue secrets (when the worker deploys, Phase 3)

The admin page code is done; it just needs its secrets when the worker
first deploys. From `apps/worker`:

```sh
cd C:\GameDev\find_your_pickle_balls\apps\worker
npx wrangler login
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put ADMIN_TOKEN
```

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard →
  https://supabase.com/dashboard/project/myqkjecfuqqjiknzqtbi →
  **Settings** (gear) → **API** → copy the **service_role** key (the
  secret one, NOT anon). Paste when wrangler prompts.
- `ADMIN_TOKEN`: any long random string — it's the moderation-page
  password. Generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  Save it in your password manager; you'll type it into the login box at
  `https://<worker-url>/admin`.

- [ ] Both secrets set (only matters once Phase 3 deploys the worker)

---

## 1. Whenever you want Google login (~20 min)

Until then, the dev email/password form on the sign-in screen covers all
local testing — this is not a blocker for anything.

1. Google Cloud Console → https://console.cloud.google.com →
   **APIs & Services** → **Credentials** (create/select any project —
   using the same project as Firebase keeps things tidy).
2. **Create credentials** → **OAuth client ID**.
   - If prompted to configure the consent screen first: User type
     **External**, app name `Pickup`, your email for the contact fields,
     scopes: none needed beyond default, test users: your own email →
     Save.
3. Application type: **Web application** (yes, web — Supabase handles
   the mobile handoff).
4. Under **Authorized redirect URIs** add exactly:
   `https://myqkjecfuqqjiknzqtbi.supabase.co/auth/v1/callback`
5. Create → copy the **Client ID** and **Client secret**.
6. Supabase Dashboard → **Authentication** → **Sign In / Providers** →
   **Google** → toggle **Enable**, paste Client ID + Secret → **Save**.
7. Test: "Continue with Google" button on the app's sign-in screen.

- [ ] Google provider enabled and tested

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

## 3. Calendar these for later

- [ ] **LLC formation** at ~9 weeks before launch. PLAN.md §10 has the
  full week-by-week gate table: LLC + EIN + bank account → D-U-N-S number
  (do first, longest wait) → Apple Developer *org* account ($99/yr) +
  Play Console org ($25 once). The org accounts keep your personal
  name/address off the store listings and skip Google's 12-tester gate.
- [ ] **Domain** — `pickupsports.app` is a placeholder in the code; buy
  the real domain (or tell Claude the actual name to search-replace)
  before the website or deep links go live. Also unblocks SMTP (item 2).
- [X] **Apple Developer account** — signed up 2026-07-06 (individual).
  §10 still calls for converting to an *organization* account before
  store launch — Apple supports individual → org conversion using the
  LLC's D-U-N-S number, so nothing to redo now.

---

## Done (history)

- **0a. Phase 2 unblockers** — done 2026-07-07: migration pushed, Edge
  Functions deployed, full verification pass on the two-emulator rig
  (geofenced check-in, live cross-device pin updates, DMs both
  directions, unread badges, report, soft-delete broadcast,
  block/unblock).
- **0a½. Occupancy-count fix migration** — pushed & verified live
  2026-07-07 (`my_blocked_players` RPC responding; venue_occupancy now
  counts players, not distinct sports).
- **0b (first half)** — Firebase project created, `google-services.json`
  in `apps/mobile/`, `app.json` wired, dev build rebuilt with it, and
  push **registration** verified end-to-end on-device 2026-07-07 (real
  `ExponentPushToken` saved to `push_tokens` on sign-in).
- **Venue rename + top-up** — done 2026-07-06: 1,220 venues live, 661
  renamed from containing park/school. (For future SQL files:
  `pnpm dlx supabase db query --linked --file <path>`.)
- **Phase 0 + Phase 1 unblockers** — done 2026-07-06: migrations pushed,
  Austin venue layer loaded (1,210 OSM venues), email confirmation off
  for dev.
