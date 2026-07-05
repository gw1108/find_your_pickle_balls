# Android agent rig setup (PLAN.md §9)

The daily dev loop: agents build, install, drive, screenshot, and E2E-test the
Expo dev build on a local Android emulator. iOS never enters this loop (§9.1).

## One-time setup (steps 1–2 need an elevated terminal / a human)

1. **Windows Hypervisor Platform** (admin PowerShell, then reboot):

   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
   ```

   Don't install AEHD (sunset Dec 2026) or HAXM (dead). `HypervisorPresent=True`
   on this machine already — only the WHPX feature flag is needed.

2. **Android Studio** — `winget install Google.AndroidStudio` (UAC prompt).
   First launch → install SDK + platform-tools. Add to PATH:
   `%LOCALAPPDATA%\Android\Sdk\platform-tools` and `...\Sdk\emulator`.

3. **AVD**: Device Manager → Pixel-class device → x86_64 **Google Play**
   (store-logo) system image, API 34. Sign into the Play Store with the
   dedicated dev Google account.

4. **MCP wiring** for Claude Code (Node 22+ already installed):

   ```sh
   claude mcp add mobile-mcp -- npx -y @mobilenext/mobile-mcp
   # optional, needs Java 17+ (Android Studio bundles a JBR you can point JAVA_HOME at):
   claude mcp add maestro -- maestro mcp
   ```

5. **Dev build**: MapLibre is a native module (not Expo Go-compatible), so the
   app runs as a development build:

   ```sh
   cd apps/mobile
   npx expo run:android    # builds + installs on the running emulator
   ```

## Day-one checks

- Install Nomad Table from the Play Store on the AVD (UX study, §9) — if Play
  Integrity blocks it, fall back to a physical phone + adb + scrcpy.
- Verify `adb devices` sees the AVD and mobile-mcp can screenshot it.
