// Push dispatch for chat (PLAN.md §5): the sender's client calls this right
// after a successful message insert; the function re-verifies authorship
// server-side, then fans out Expo Push to the other channel members.
// (MVP simplification — the §4.4 upgrade path is a DB webhook/pgmq consumer
// so a dropped client can't skip the push.)
// Deploy: pnpm dlx supabase functions deploy notify-message
import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(jwt);
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const { message_id } = await req.json().catch(() => ({}));
  if (typeof message_id !== "string") return json({ error: "message_id required" }, 400);

  // the message must exist and belong to the caller
  const { data: message } = await admin
    .from("messages")
    .select("id, channel_id, sender_id, content, deleted_at")
    .eq("id", message_id)
    .maybeSingle();
  if (!message || message.sender_id !== user.id || message.deleted_at) {
    return json({ error: "Not your message" }, 403);
  }

  // notification title: event title for group chats, sender name for DMs
  const [{ data: channel }, { data: sender }] = await Promise.all([
    admin
      .from("channels")
      .select("id, kind, event_id, events (title)")
      .eq("id", message.channel_id)
      .maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);
  const senderName = sender?.display_name ?? "Someone";
  const eventTitle =
    (channel?.events as { title?: string } | null)?.title ?? null;

  // recipients: other members, minus anyone in a block pair with the sender
  const { data: members } = await admin
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", message.channel_id)
    .neq("user_id", user.id);
  const { data: blockRows } = await admin
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  const blocked = new Set(
    (blockRows ?? []).flatMap((b) => [b.blocker_id, b.blocked_id])
  );
  const recipientIds = (members ?? [])
    .map((m) => m.user_id)
    .filter((id) => !blocked.has(id));
  if (recipientIds.length === 0) return json({ sent: 0 });

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", recipientIds);
  if (!tokens || tokens.length === 0) return json({ sent: 0 });

  const notifications = tokens.map(({ token }) => ({
    to: token,
    title: eventTitle ?? senderName,
    body: eventTitle
      ? `${senderName}: ${message.content ?? "📷 Photo"}`
      : message.content ?? "📷 Photo",
    data: { channelId: message.channel_id },
    channelId: "chat", // Android notification channel (set up in the app)
  }));

  let sent = 0;
  for (let i = 0; i < notifications.length; i += CHUNK) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifications.slice(i, i + CHUNK)),
    });
    if (res.ok) sent += notifications.slice(i, i + CHUNK).length;
  }
  return json({ sent });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
