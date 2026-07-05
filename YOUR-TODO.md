# Your action list (human-only steps)

Everything else in Phase 0 is done and committed. These are the steps agents
can't do for you, in the order that unblocks Phase 1 fastest. Check items off
as you go.

## 1. Unblock the Android rig (~10 min + reboot)

- [ ] **Enable WHPX** — open an *admin* PowerShell and run:

  ```powershell
  Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
  ```

  Then **reboot**. (The emulator falls back to unusably slow software
  emulation without this. Don't install AEHD or HAXM — both dead/dying.)

- [ ] **Boot the emulator and sign into the Play Store** (new shell so PATH
  picks up the SDK):

  ```powershell
  emulator -avd pickup
  ```

  Sign in with your **dedicated dev Google account** (not your personal one).

- [ ] **Install Nomad Table** from the Play Store on the AVD — the UX study
  from PLAN.md §9. If Play Integrity blocks it (unlikely), we fall back to a
  physical phone + USB.

## 2. Create the service accounts (~30 min)

- [ ] **Supabase** — create a project at supabase.com (free tier), then in a
  repo terminal:

  ```powershell
  pnpm dlx supabase login
  pnpm dlx supabase link --project-ref <YOUR_PROJECT_REF>
  pnpm dlx supabase db push
  ```

  Then enable the `postgis` and `pg_cron` extensions in Dashboard → Database →
  Extensions (postgis is created by the migration, but verify), and copy the
  project URL + anon key into `apps/mobile/.env` (template: `.env.example`).

- [ ] **Stream Chat** — register the **Maker plan account explicitly** at
  getstream.io/maker-account. The default free "Build" tier is only 1,000 MAU;
  Maker is 2,000 MAU / 100 peak concurrent (PLAN.md §5). Put the API key in
  `apps/mobile/.env`.

- [ ] **Expo / EAS** — create an account at expo.dev, then in `apps/mobile`:

  ```powershell
  pnpm dlx eas-cli login
  pnpm dlx eas-cli init
  ```

  (This stamps the EAS project ID into `app.json` — commit that change.)

- [ ] **Stadia Maps** — sign up, **Starter plan ($20/mo)** when we're ready to
  render tiles (free tier is non-commercial only — fine for the first dev
  spike). Put the style URL in `apps/mobile/.env`.

## 3. GitHub remote (~5 min, makes CI live)

- [ ] Create a private repo on GitHub, then:

  ```powershell
  git remote add origin https://github.com/<you>/<repo>.git
  git push -u origin main
  ```

## 4. Not yet — calendar these for later

- [ ] **LLC formation** at ~9 weeks before launch (PLAN.md §10 has the full
  week-by-week gate table: LLC → D-U-N-S → Apple org $99/yr + Play org $25).
- [ ] **Domain** — pickupsports.app is a placeholder in the code; buy the real
  domain (or tell Claude the actual name to search-replace) before the website
  or deep links go live.
- [ ] **Apple Developer account** — only needed at the first iOS milestone
  build (end of Phase 1), not now.

---

When items 1–2 are done, tell Claude to start **Phase 1** (PLAN.md §12): the
maplibre-react-native v11 pin-and-verify spike, then the map screen + core
join loop against the live Supabase project.
