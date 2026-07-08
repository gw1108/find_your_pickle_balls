import { defineConfig } from "astro/config";

// Static marketing + compliance site → Cloudflare Workers static assets
// (PLAN.md §7; see wrangler.toml — assets-only Worker, no server code).
// Dynamic routes (/e/:eventId, /admin) live in apps/worker, not here.
export default defineConfig({
  output: "static",
  site: "https://pickupsports.app",
});
