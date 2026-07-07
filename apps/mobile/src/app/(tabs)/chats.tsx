import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage , formatEventTime, formatMessageTime } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUnread } from '@/lib/unread';

export default function ChatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { channels, refresh } = useUnread();
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh()
        .then(() => setError(null))
        .catch((e) => setError(errorMessage(e)));
    }, [refresh])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ThemedText type="subtitle" style={styles.header}>
          Chats
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.header}>
            {error}
          </ThemedText>
        )}
        <FlatList
          data={channels}
          keyExtractor={(c) => c.channel_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/chat/[id]', params: { id: item.channel_id } })
              }>
              <ThemedView type="backgroundElement" style={styles.row}>
                <View style={styles.rowBody}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.kind === 'dm'
                      ? (item.dm_partner_name ?? 'Direct message')
                      : (item.event_title ?? 'Group chat')}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.last_message_preview ??
                      (item.event_starts_at
                        ? formatEventTime(item.event_starts_at)
                        : 'No messages yet')}
                  </ThemedText>
                </View>
                {item.last_message_at && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatMessageTime(item.last_message_at)}
                  </ThemedText>
                )}
                {item.unread_count > 0 && (
                  <View style={[styles.badge, { backgroundColor: theme.text }]}>
                    <ThemedText type="small" style={{ color: theme.background }}>
                      {item.unread_count}
                    </ThemedText>
                  </View>
                )}
              </ThemedView>
            </Pressable>
          )}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              Join a game to get its group chat.
            </ThemedText>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  list: { padding: Spacing.three, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  empty: { textAlign: 'center', marginTop: Spacing.six },
});
