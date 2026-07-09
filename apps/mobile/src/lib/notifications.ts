// Push + badge hygiene (PLAN.md §5): register the Expo push token, deep-link
// notification taps into the thread, and keep the app-icon badge honest (a
// top Nomad-Table complaint — the badge must always equal real unread count).
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { savePushToken } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

// The thread the user is currently reading — its own pushes are pure noise
// (the message is already on screen), so the handler drops them.
let activeChannelId: string | null = null;

/** Chat screen marks itself active on mount, null on unmount. */
export function setActiveChatChannel(channelId: string | null): void {
  activeChannelId = channelId;
}

// foreground messages: banner only — unread state lives in the DB, not here
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const channelId = notification.request.content.data?.channelId;
    const suppress = typeof channelId === "string" && channelId === activeChannelId;
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

// In-flight registration — other UI (the geofence check-in Alert) awaits this
// so it never races the OS notification-permission dialog on first launch.
let registration: Promise<void> | null = null;

/** Resolves once any push registration (and its permission dialog) settles.
 * If registration hasn't started yet, waits briefly for it to kick off —
 * the root layout fires it right after sign-in/onboarding. */
export async function pushRegistrationSettled(): Promise<void> {
  if (!registration) await new Promise((r) => setTimeout(r, 1500));
  await (registration ?? Promise.resolve());
}

/** Register for push and store the token. Safe to call on every sign-in;
 * quietly no-ops where push can't work (emulator without FCM, denied
 * permission) so the dev loop never breaks on it. */
export function registerForPush(userId: string): Promise<void> {
  registration = doRegisterForPush(userId);
  return registration;
}

async function doRegisterForPush(userId: string): Promise<void> {
  try {
    if (!Device.isDevice && Platform.OS === "ios") return; // no push on iOS sim

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("chat", {
        name: "Chat messages",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await savePushToken(userId, token, Platform.OS === "ios" ? "ios" : "android");
  } catch {
    // push is best-effort: Android dev builds need FCM credentials on EAS
    // before getExpoPushTokenAsync succeeds (queued in YOUR-TODO.md)
  }
}

/** Deep-link notification taps into the chat thread (§5). */
export function useNotificationDeepLinks(
  navigate: (channelId: string) => void
): void {
  useEffect(() => {
    // cold start from a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const channelId = response?.notification.request.content.data?.channelId;
      if (typeof channelId === "string") navigate(channelId);
    });
    // taps while running
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const channelId = response.notification.request.content.data?.channelId;
      if (typeof channelId === "string") navigate(channelId);
    });
    return () => sub.remove();
  }, [navigate]);
}

/** Fire the push fan-out for a just-sent message (see notify-message fn). */
export function notifyMessageSent(messageId: string): void {
  // fire-and-forget: a failed push must never block or slow the send path
  supabase.functions
    .invoke("notify-message", { body: { message_id: messageId } })
    .catch(() => {});
}
