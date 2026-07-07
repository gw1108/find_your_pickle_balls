import { z } from "zod";
import { uuidSchema } from "./schemas";

/** Chat on Supabase Realtime (PLAN.md §5). Event channels at MVP; DMs reuse
 * the same tables in Phase 2. */
export const channelKindSchema = z.enum(["event", "dm"]);
export type ChannelKind = z.infer<typeof channelKindSchema>;

export const channelSchema = z.object({
  id: uuidSchema,
  kind: channelKindSchema,
  event_id: uuidSchema.nullable(),
  created_at: z.string(),
});
export type Channel = z.infer<typeof channelSchema>;

export const messageSchema = z.object({
  id: uuidSchema,
  channel_id: uuidSchema,
  sender_id: uuidSchema,
  content: z.string().max(2000).nullable(),
  /** Supabase Storage object path for photo messages. */
  image_path: z.string().nullable(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

/** Row shape returned by the my_channels() RPC — the inbox screen. */
export const channelListItemSchema = z.object({
  channel_id: uuidSchema,
  kind: channelKindSchema,
  event_id: uuidSchema.nullable(),
  event_title: z.string().nullable(),
  event_starts_at: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_message_preview: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
});
export type ChannelListItem = z.infer<typeof channelListItemSchema>;

/** Realtime topic for a channel's Broadcast-from-Database stream. */
export const chatTopic = (channelId: string) => `chat:${channelId}`;
