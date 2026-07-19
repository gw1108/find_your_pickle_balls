---
name: verify
description: Drive the Pickup mobile app on the headless Android emulator rig to verify UI changes end-to-end.
---

# Verify mobile changes on the Android rig

All commands via the Bash tool (Git Bash paths). `adb`/`emulator` live under `$LOCALAPPDATA/Android/Sdk`.

## Boot + launch (~1 min when the dev client is already installed)

1. Emulator, headless (background Bash call; wedges at boot without these flags):
   `"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" -avd Medium_Phone -no-window -gpu swiftshader_indirect -no-audio -no-boot-anim`
2. Poll `adb shell getprop sys.boot_completed` until `1` (~40 s).
3. GPS to the Shoal Beach test venue: `adb emu geo fix -97.7486422 30.2673267`
4. Metro (background, from apps/mobile): `pnpm start`
5. `adb reverse tcp:8081 tcp:8081`, then launch the installed dev client:
   `adb shell am start -a android.intent.action.VIEW -d "pickup://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`
6. Wait for `Android Bundled` in the Metro log (seconds warm; 10–15 min after a fresh pnpm install). The emulator keeps a logged-in, onboarded session.

## Driving

- Screenshot: `adb exec-out screencap -p > shot.png` (read with the Read tool; screen is 1080x2400).
- On launch a "Check in?" Alert usually covers the map — dismiss via its NOT NOW button.
- Map screen → + FAB (bottom right) opens create-event.
- To reload JS after an edit: `adb shell am force-stop app.pickupsports.mobile`, relaunch via the deep link above (~25 s to interactive).
- Onboarding screen is unreachable with an onboarded account (router guard bounces `pickup://onboarding`); needs a fresh account.
- Don't submit "Create game" with valid data — it writes to the live Supabase DB. The past-time validation alert makes a safe submit probe.
