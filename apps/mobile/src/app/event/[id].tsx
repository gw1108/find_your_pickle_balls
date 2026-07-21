import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { errorMessage ,
  formatEventTime,
  formatSkillRange,
  SPORT_EMOJI,
  SPORT_LABEL,
} from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UserActionsSheet, type UserActionsTarget } from '@/components/user-actions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  fetchEventChannelId,
  fetchEventDetail,
  joinEvent,
  leaveEvent,
  type EventDetail,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session!.user.id;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [userActions, setUserActions] = useState<UserActionsTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const detail = await fetchEventDetail(id);
      setEvent(detail);
    } catch (e) {
      Alert.alert('Could not load event', errorMessage(e));
    }
  }, [id]);

  // inline .then() instead of load(): react-hooks/set-state-in-effect can't
  // see through the async callback and flags the direct call
  useEffect(() => {
    let cancelled = false;
    fetchEventDetail(id)
      .then((detail) => {
        if (!cancelled) setEvent(detail);
      })
      .catch((e) => {
        if (!cancelled) Alert.alert('Could not load event', errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!event) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText themeColor="textSecondary">Loading…</ThemedText>
      </ThemedView>
    );
  }

  const going = event.rsvps.filter((r) => r.status === 'going');
  const myRsvp = going.find((r) => r.user_id === userId);
  const isHost = event.host_id === userId;
  const full = event.player_cap !== null && going.length >= event.player_cap;
  const needMore =
    event.player_cap !== null ? Math.max(0, event.player_cap - going.length) : null;
  const skill = formatSkillRange(event.skill_min, event.skill_max);

  const openChat = async () => {
    const channelId = await fetchEventChannelId(event.id);
    if (channelId) {
      router.push({ pathname: '/chat/[id]', params: { id: channelId } });
    }
  };

  // One-tap join (§2): no host approval — RSVP, then straight into the chat.
  const join = async () => {
    setBusy(true);
    try {
      const channelId = await joinEvent(event.id, userId);
      // straight into the chat (§2: open-app → in-the-chat in under 10s) —
      // the detail refreshes behind the pushed screen, not in front of it
      load();
      if (channelId) {
        router.push({ pathname: '/chat/[id]', params: { id: channelId } });
      }
    } catch (e) {
      Alert.alert('Could not join', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await leaveEvent(event.id, userId);
      await load();
    } catch (e) {
      Alert.alert('Could not leave', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const report = () => {
    Alert.alert('Report event', 'Report this event to the moderation team?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('reports').insert({
            reporter_id: userId,
            target_kind: 'event',
            target_id: event.id,
            reason: 'Reported from event screen',
          });
          Alert.alert(
            error ? 'Could not report' : 'Reported',
            error ? error.message : 'Our team reviews reports within 24 hours.'
          );
        },
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: event.sport_other_label ?? SPORT_LABEL[event.sport] }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={styles.emoji}>{SPORT_EMOJI[event.sport]}</ThemedText>
        <ThemedText type="subtitle">{event.title}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {formatEventTime(event.starts_at)}
          {skill ? ` · ${skill}` : ''}
        </ThemedText>
        {event.venue && (
          <ThemedText themeColor="textSecondary">
            📍 {event.venue.name}
            {event.venue.address ? ` — ${event.venue.address}` : ''}
          </ThemedText>
        )}
        {event.description ? <ThemedText>{event.description}</ThemedText> : null}

        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">
            {going.length} going
            {needMore !== null ? (needMore > 0 ? ` · need ${needMore} more` : ' · full') : ''}
          </ThemedText>
          {going.map((r) => (
            <Pressable
              key={r.user_id}
              accessibilityRole="button"
              disabled={r.user_id === userId}
              onPress={() =>
                setUserActions({
                  id: r.user_id,
                  name: r.profile?.display_name ?? 'Player',
                })
              }
              style={styles.attendee}>
              <ThemedText type="small">
                {r.profile?.display_name ?? 'Player'}
                {r.user_id === event.host_id ? '  (host)' : ''}
              </ThemedText>
            </Pressable>
          ))}
        </ThemedView>

        {myRsvp || isHost ? (
          <>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={openChat}
              style={[styles.button, { backgroundColor: theme.text }]}>
              <ThemedText style={{ color: theme.background }}>Open group chat</ThemedText>
            </Pressable>
            {!isHost && (
              <Pressable accessibilityRole="button" disabled={busy} onPress={leave}>
                <ThemedText type="link" themeColor="textSecondary" style={styles.centerText}>
                  Leave event
                </ThemedText>
              </Pressable>
            )}
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy || full}
            onPress={join}
            style={[
              styles.button,
              { backgroundColor: full ? theme.backgroundSelected : theme.text },
            ]}>
            <ThemedText style={{ color: full ? theme.textSecondary : theme.background }}>
              {full ? 'Event is full' : busy ? 'Joining…' : "I'm interested"}
            </ThemedText>
          </Pressable>
        )}

        <Pressable accessibilityRole="button" onPress={report}>
          <ThemedText type="link" themeColor="textSecondary" style={styles.centerText}>
            Report this event
          </ThemedText>
        </Pressable>
      </ScrollView>

      <UserActionsSheet
        target={userActions}
        onClose={() => setUserActions(null)}
        onBlocked={() => {
          setUserActions(null);
          // blocked host → event disappears; blocked attendee → refreshed list
          router.back();
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
  emoji: { fontSize: 40 },
  section: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  attendee: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
});
