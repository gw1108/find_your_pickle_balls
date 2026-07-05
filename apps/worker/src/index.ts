import { Hono } from "hono";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ADMIN_TOKEN: string;
  SITE_ORIGIN: string;
};

type PublicEvent = {
  id: string;
  title: string;
  sport: string;
  starts_at: string;
  player_cap: number | null;
  going_count: number;
};

const app = new Hono<{ Bindings: Env }>();

/** Per-event OG invite page (PLAN.md §7) — unfurls properly in iMessage/WhatsApp,
 * deep-links into the app via AASA/assetlinks, falls back to the store page. */
app.get("/e/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return c.notFound();

  const res = await fetch(
    `${c.env.SUPABASE_URL}/rest/v1/rpc/event_public`,
    {
      method: "POST",
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_event_id: eventId }),
    }
  );
  if (!res.ok) return c.notFound();
  const event = (await res.json()) as PublicEvent | null;
  if (!event) return c.notFound();

  const when = new Date(event.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
  const title = `${event.title} — ${when}`;
  const desc = `${event.going_count} going${event.player_cap ? ` · ${event.player_cap} max` : ""} · Join the ${event.sport} game on Pickup`;

  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${c.env.SITE_ORIGIN}/e/${eventId}">
</head>
<body>
<h1>${escapeHtml(event.title)}</h1>
<p>${escapeHtml(desc)}</p>
<p><a href="pickup://e/${eventId}">Open in the Pickup app</a></p>
</body>
</html>`);
});

/** Admin moderation queue (PLAN.md §8) — token-gated placeholder until the
 * real queue UI lands in Phase 2. */
app.get("/admin", (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${c.env.ADMIN_TOKEN}`) {
    return c.text("Unauthorized", 401);
  }
  return c.html("<h1>Moderation queue</h1><p>Phase 2 — reports land here.</p>");
});

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export default app;
