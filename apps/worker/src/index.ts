import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  /** wrangler secret — required for /admin (bypasses RLS to read the queue) */
  SUPABASE_SERVICE_ROLE_KEY: string;
  ADMIN_TOKEN: string;
  SITE_ORIGIN: string;
};

type PublicEvent = {
  id: string;
  title: string;
  sport: string;
  sport_other_label: string | null;
  starts_at: string;
  player_cap: number | null;
  going_count: number;
};

type Report = {
  id: string;
  reporter_id: string | null;
  target_kind: "user" | "event" | "photo" | "message";
  target_id: string;
  reason: string;
  status: "open" | "actioned" | "dismissed";
  resolution_note: string | null;
  created_at: string;
};

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Waitlist (PLAN.md §11 GTM — the landing page's one job pre-launch).
// Plain HTML form POST from the Astro site (top-level navigation, so no CORS),
// inserted with the ANON key under an insert-only RLS policy.
// ---------------------------------------------------------------------------

app.post("/waitlist", async (c) => {
  const form = await c.req.formData();
  // honeypot: hidden field real users never fill — bots get a fake success
  if (form.get("website")) return c.redirect(`${c.env.SITE_ORIGIN}/thanks`);

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return c.redirect(`${c.env.SITE_ORIGIN}/?waitlist=invalid#waitlist`);
  }
  const source = String(form.get("source") ?? "landing").slice(0, 40);

  // Plain insert, NOT an upsert: PostgREST's on_conflict/ignore-duplicates
  // path is rejected by RLS on tables with no select policy (verified live
  // 2026-07-07 — 42501 even with an insert policy). A duplicate email comes
  // back as 409/23505 instead, which is a success as far as the user knows.
  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/waitlist`, {
    method: "POST",
    headers: {
      apikey: c.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${c.env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      // no select policy on waitlist → must not ask for the row back
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ email, source }),
  });
  if (res.status === 409) return c.redirect(`${c.env.SITE_ORIGIN}/thanks`);
  if (!res.ok) {
    console.error(`waitlist insert failed: ${res.status} ${await res.text()}`);
    return c.redirect(`${c.env.SITE_ORIGIN}/?waitlist=error#waitlist`);
  }
  return c.redirect(`${c.env.SITE_ORIGIN}/thanks`);
});

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
        // event_public RETURNS TABLE → PostgREST sends an array unless we
        // ask for exactly one object (406s instead when there's no row)
        Accept: "application/vnd.pgrst.object+json",
      },
      body: JSON.stringify({ p_event_id: eventId }),
    }
  );
  if (!res.ok) return c.notFound();
  const event = (await res.json()) as PublicEvent;

  const when = new Date(event.starts_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
  const title = `${event.title} — ${when}`;
  const sportName = event.sport_other_label ?? event.sport;
  const desc = `${event.going_count} going${event.player_cap ? ` · ${event.player_cap} max` : ""} · Join the ${sportName} game on Pickup`;

  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta property="og:site_name" content="Pickup">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${c.env.SITE_ORIGIN}/e/${eventId}">
<meta name="twitter:card" content="summary">
<!-- Smart App Banner — uncomment once the App Store id exists (PLAN.md §7):
<meta name="apple-itunes-app" content="app-id=TODO, app-argument=${c.env.SITE_ORIGIN}/e/${eventId}">
-->
<style>
  body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 0 auto; padding: 2rem 1rem; line-height: 1.6; }
  .cta { display: inline-block; background: #208AEF; color: #fff; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; }
  .muted { color: #666; font-size: 0.9rem; }
</style>
</head>
<body>
<p class="muted">Pickup · ${escapeHtml(sportName)}</p>
<h1>${escapeHtml(event.title)}</h1>
<p>${escapeHtml(when)} · ${escapeHtml(desc)}</p>
<p><a class="cta" href="pickup://e/${eventId}">Open in the Pickup app</a></p>
<!-- Store fallback (PLAN.md §7): swap for App Store / Play links at launch.
     Play link gets the Install Referrer for deferred deep-linking:
     https://play.google.com/store/apps/details?id=app.pickupsports.mobile&referrer=e%3D${eventId} -->
<p class="muted">Don't have the app yet? It's coming soon —
  <a href="${c.env.SITE_ORIGIN}/#waitlist">join the waitlist</a>.</p>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Admin moderation queue (PLAN.md §8 — 24h review SLA).
// Cookie-gated by ADMIN_TOKEN; queries run with the service role (RLS bypass).
// ---------------------------------------------------------------------------

/** Service-role PostgREST fetch. */
async function db<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function isAdmin(c: Context<{ Bindings: Env }>, env: Env): boolean {
  // Fail closed while the ADMIN_TOKEN secret is unset — otherwise a fresh
  // deploy compares undefined === undefined and lets everyone in.
  if (!env.ADMIN_TOKEN) return false;
  return (
    getCookie(c, "admin_token") === env.ADMIN_TOKEN ||
    c.req.header("Authorization") === `Bearer ${env.ADMIN_TOKEN}`
  );
}

const loginPage = `<!doctype html><html><head><meta charset="utf-8"><title>Admin</title></head>
<body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1>Moderation queue</h1>
<form method="post" action="/admin/login">
  <input type="password" name="token" placeholder="Admin token" autofocus>
  <button type="submit">Sign in</button>
</form></body></html>`;

app.post("/admin/login", async (c) => {
  const form = await c.req.formData();
  if (form.get("token") !== c.env.ADMIN_TOKEN) return c.text("Wrong token", 401);
  setCookie(c, "admin_token", c.env.ADMIN_TOKEN, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect("/admin");
});

app.get("/admin", async (c) => {
  if (!isAdmin(c, c.env)) return c.html(loginPage, 401);

  const reports = await db<Report[]>(
    c.env,
    "reports?status=eq.open&order=created_at.asc&limit=100"
  );

  // hydrate target context per kind (batched in queries)
  const ids = (kind: Report["target_kind"]) =>
    reports.filter((r) => r.target_kind === kind).map((r) => r.target_id);
  const inList = (xs: string[]) => `in.(${xs.join(",")})`;

  const [users, events, messages] = await Promise.all([
    ids("user").length
      ? db<{ id: string; display_name: string }[]>(
          c.env,
          `profiles?id=${inList(ids("user"))}&select=id,display_name`
        )
      : [],
    ids("event").length
      ? db<{ id: string; title: string; status: string }[]>(
          c.env,
          `events?id=${inList(ids("event"))}&select=id,title,status`
        )
      : [],
    ids("message").length
      ? db<
          { id: string; content: string | null; deleted_at: string | null; sender: { display_name: string } | null }[]
        >(
          c.env,
          `messages?id=${inList(ids("message"))}&select=id,content,deleted_at,sender:profiles(display_name)`
        )
      : [],
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const messageById = new Map(messages.map((m) => [m.id, m]));

  const rows = reports
    .map((r) => {
      let context = "";
      let enforcement = "";
      if (r.target_kind === "user") {
        context = `User: ${escapeHtml(userById.get(r.target_id)?.display_name ?? "(deleted)")}`;
      } else if (r.target_kind === "event") {
        const e = eventById.get(r.target_id);
        context = e
          ? `Event: ${escapeHtml(e.title)} (${e.status})`
          : "Event: (deleted)";
        if (e && e.status === "active") {
          enforcement = `<label><input type="checkbox" name="cancel_event" value="1"> also cancel event</label>`;
        }
      } else if (r.target_kind === "message") {
        const m = messageById.get(r.target_id);
        context = m
          ? `Message from ${escapeHtml(m.sender?.display_name ?? "?")}: “${escapeHtml(m.content ?? "(photo)")}”${m.deleted_at ? " (already deleted)" : ""}`
          : "Message: (deleted)";
        if (m && !m.deleted_at) {
          enforcement = `<label><input type="checkbox" name="delete_message" value="1"> also delete message</label>`;
        }
      } else {
        context = `Photo: ${escapeHtml(r.target_id)}`;
      }
      return `<li style="margin-bottom:24px;border-bottom:1px solid #ddd;padding-bottom:16px">
  <div><b>${r.target_kind}</b> · ${new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}
    · ${r.reporter_id ? "user report" : "auto-flag"}</div>
  <div>${context}</div>
  <div>Reason: ${escapeHtml(r.reason)}</div>
  <form method="post" action="/admin/reports/${r.id}" style="margin-top:8px">
    <input name="note" placeholder="Resolution note (shown to the reporter)" style="width:60%">
    ${enforcement}
    <button name="verdict" value="actioned">Action</button>
    <button name="verdict" value="dismissed">Dismiss</button>
  </form>
</li>`;
    })
    .join("\n");

  return c.html(`<!doctype html><html><head><meta charset="utf-8"><title>Moderation queue</title></head>
<body style="font-family:system-ui;max-width:800px;margin:40px auto;padding:0 16px">
<h1>Moderation queue</h1>
<p>${reports.length} open report(s) · 24h SLA (§8) · every resolution needs a reason — no silent bans.</p>
<ul style="list-style:none;padding:0">${rows || "<li>Queue is empty 🎉</li>"}</ul>
</body></html>`);
});

app.post("/admin/reports/:id", async (c) => {
  if (!isAdmin(c, c.env)) return c.text("Unauthorized", 401);
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.notFound();

  const form = await c.req.formData();
  const verdict = form.get("verdict");
  if (verdict !== "actioned" && verdict !== "dismissed") {
    return c.text("Bad verdict", 400);
  }
  const note = String(form.get("note") ?? "").slice(0, 1000) || null;

  const [report] = await db<Report[]>(c.env, `reports?id=eq.${id}&select=*`);
  if (!report) return c.notFound();

  // optional enforcement riders
  if (verdict === "actioned") {
    if (form.get("delete_message") && report.target_kind === "message") {
      await db(c.env, `messages?id=eq.${report.target_id}`, {
        method: "PATCH",
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      });
    }
    if (form.get("cancel_event") && report.target_kind === "event") {
      await db(c.env, `events?id=eq.${report.target_id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
    }
  }

  await db(c.env, `reports?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: verdict, resolution_note: note }),
  });
  return c.redirect("/admin");
});

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export default app;
