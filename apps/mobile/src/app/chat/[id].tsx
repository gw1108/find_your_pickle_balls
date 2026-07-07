import Ionicons from '@expo/vector-icons/Ionicons';
import { chatTopic } from '@pickup/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
// edge-to-edge-safe composer handling (SDK 57 Android): the list uses RN's
// automatic keyboard insets; the composer rides the keyboard via StickyView
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage , formatMessageTime } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  fetchMessages,
  markChannelRead,
  sendMessage,
  type MessageWithSender,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 50;

export default function ChatScreen() {
  const { id: channelId } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const userId = session!.user.id;

  // newest-first to match the inverted FlatList
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endReached = useRef(false);

  const mergeMessages = useCallback((incoming: MessageWithSender[]) => {
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return cur;
      return [...fresh, ...cur].sort(
        (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
      );
    });
  }, []);

  // initial page + read stamp
  useEffect(() => {
    (async () => {
      try {
        const page = await fetchMessages(channelId, undefined, PAGE_SIZE);
        endReached.current = page.length < PAGE_SIZE;
        setMessages(page);
        await markChannelRead(channelId);
      } catch (e) {
        Alert.alert('Could not load chat', errorMessage(e));
      }
    })();
  }, [channelId]);

  // live delivery: Broadcast-from-Database on the private chat topic (§5).
  // Lazy-connect discipline: subscribe on mount, remove on unmount.
  useEffect(() => {
    // private channels authorize against realtime.messages RLS — the realtime
    // client needs the user JWT before subscribing
    supabase.realtime.setAuth();
    const channel = supabase
      .channel(chatTopic(channelId), { config: { private: true } })
      .on('broadcast', { event: 'INSERT' }, async (payload) => {
        const record = (payload.payload as { record?: MessageWithSender } | undefined)
          ?.record;
        if (!record || record.channel_id !== channelId) return;
        // broadcast rows carry no join — show immediately, name arrives on refetch
        mergeMessages([{ ...record, sender: record.sender ?? null }]);
        await markChannelRead(channelId);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, mergeMessages]);

  const loadOlder = async () => {
    if (endReached.current || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    const page = await fetchMessages(channelId, oldest, PAGE_SIZE);
    endReached.current = page.length < PAGE_SIZE;
    setMessages((cur) => [...cur, ...page]);
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    // optimistic row; replaced when the broadcast echoes back
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: MessageWithSender = {
      id: optimisticId,
      channel_id: channelId,
      sender_id: userId,
      content,
      image_path: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      sender: profile
        ? { id: userId, display_name: profile.display_name, avatar_url: profile.avatar_url }
        : null,
    };
    setMessages((cur) => [optimistic, ...cur]);
    try {
      await sendMessage(channelId, userId, content);
      setMessages((cur) => cur.filter((m) => m.id !== optimisticId));
      // pick up our own row (broadcast may or may not echo before this)
      mergeMessages(await fetchMessages(channelId, undefined, 5));
    } catch (e) {
      setMessages((cur) => cur.filter((m) => m.id !== optimisticId));
      setDraft(content);
      Alert.alert('Not sent', errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: MessageWithSender }) => {
    const mine = item.sender_id === userId;
    if (item.deleted_at) {
      return (
        <ThemedText type="small" themeColor="textSecondary" style={styles.deleted}>
          message deleted
        </ThemedText>
      );
    }
    return (
      <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
        <View
          style={[
            styles.bubble,
            { backgroundColor: mine ? theme.text : theme.backgroundElement },
          ]}>
          {!mine && (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {item.sender?.display_name ?? 'Player'}
            </ThemedText>
          )}
          <ThemedText style={{ color: mine ? theme.background : theme.text }}>
            {item.content}
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: mine ? theme.backgroundSelected : theme.textSecondary }}>
            {formatMessageTime(item.created_at)}
          </ThemedText>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Chat' }} />
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.4}
        automaticallyAdjustKeyboardInsets
      />
      {/* translates with the keyboard (edge-to-edge safe); opened offset
          returns the nav-bar padding the keyboard already covers */}
      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View
          style={[
            styles.composer,
            { paddingBottom: insets.bottom + Spacing.two, borderTopColor: theme.backgroundElement },
          ]}>
          <TextInput
            placeholder="Message"
            placeholderTextColor={theme.textSecondary}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim() || sending}
            onPress={send}
            style={[styles.send, { backgroundColor: theme.text }]}>
            <Ionicons name="arrow-up" size={20} color={theme.background} />
          </Pressable>
        </View>
      </KeyboardStickyView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  deleted: { textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    maxHeight: 120,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
