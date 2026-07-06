# Your action list (human-only steps)

Everything else in Phase 0 is done and committed. These are the steps agents
can't do for you, in the order that unblocks Phase 1 fastest. Check items off
as you go.

## 1. Unblock the Android rig (~10 min + reboot)

> The **per-machine** rig setup (enable WHPX + reboot, boot the emulator, sign
> into Play, sign the CLIs in) now lives in the README **Prereqs** section so it
> gets redone on every dev box. Do that first, then the one-time task below.

- [X] **Install Nomad Table** from the Play Store on the AVD — the UX study
  from PLAN.md §9. If Play Integrity blocks it (unlikely), we fall back to a
  physical phone + USB.

## 2. Create the service accounts (~30 min)

- [X] **Supabase** — create a project at supabase.com (free tier), then in a
  repo terminal:

  ```powershell
  pnpm dlx supabase login
  pnpm dlx supabase link --project-ref <YOUR_PROJECT_REF>
  pnpm dlx supabase db push
  ```

  Then enable the `postgis` and `pg_cron` extensions in Dashboard → Database →
  Extensions (postgis is created by the migration, but verify), and copy the
  project URL + anon key into `apps/mobile/.env` (template: `.env.example`).

- [X] ~~**Stream Chat**~~ — **no longer needed.** Chat pivoted to Supabase
  Realtime on 2026-07-06 (PLAN.md §5) after the Maker program rejected
  free-email-domain signups. No chat vendor, no account, no API key.

- [X] **Expo / EAS** — create an account at expo.dev, then in `apps/mobile`:

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
  or deep links go live. (It briefly blocked the Stream signup; the Supabase
  chat pivot removed that dependency, so it's back to "later".)
- [ ] **Apple Developer account** — only needed at the first iOS milestone
  build (end of Phase 1), not now.

---

When items 1–2 are done, tell Claude to start **Phase 1** (PLAN.md §12): the
maplibre-react-native v11 pin-and-verify spike, then the map screen + core
join loop against the live Supabase project.
