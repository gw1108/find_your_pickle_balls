import { defineConfig } from "astro/config";

// Static marketing + compliance site → Cloudflare Pages (PLAN.md §7).
// Dynamic routes (/e/:eventId, /admin) live in apps/worker, not here.
export default defineConfig({
  output: "static",
  site: "https://pickupsports.app",
});
