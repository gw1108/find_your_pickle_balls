// Single source of truth for the inbox + unread counts (§5 badge hygiene):
// every surface reads the same fetch, and the app-icon badge is recomputed
// from the real total on every refresh — it can never drift or go stale.
import type { ChannelListItem } from "@pickup/shared";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchMyChannels } from "@/lib/queries";

type UnreadContextValue = {
  channels: ChannelListItem[];
  unread: number;
  /** Refetch channels and re-sync the app-icon badge. */
  refresh: () => Promise<void>;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<ChannelListItem[]>([]);

  const refresh = useCallback(async () => {
    const next = await fetchMyChannels();
    setChannels(next);
    const total = next.reduce((sum, c) => sum + c.unread_count, 0);
    // badge write is best-effort (no-op on platforms without badge support)
    Notifications.setBadgeCountAsync(total).catch(() => {});
  }, []);

  const unread = useMemo(
    () => channels.reduce((sum, c) => sum + c.unread_count, 0),
    [channels]
  );

  return (
    <UnreadContext.Provider value={{ channels, unread, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error("useUnread must be used inside UnreadProvider");
  return ctx;
}
