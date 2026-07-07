import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  formatDistance,
  formatEventTime,
  formatSkillRange,
  SPORT_EMOJI,
} from '@/lib/format';
import type { NearbyEvent } from '@/lib/queries';

export function EventCard({ event, onPress }: { event: NearbyEvent; onPress: () => void }) {
  const skill = formatSkillRange(event.skill_min, event.skill_max);
  const spotsLeft =
    event.player_cap !== null ? Math.max(0, event.player_cap - event.going_count) : null;

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.emoji}>{SPORT_EMOJI[event.sport]}</ThemedText>
        <View style={styles.body}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {event.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatEventTime(event.starts_at)} · {formatDistance(event.distance_m)}
            {skill ? ` · ${skill}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {event.going_count} going
            {spotsLeft !== null
              ? spotsLeft > 0
                ? ` · need ${spotsLeft} more`
                : ' · full'
              : ''}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  emoji: { fontSize: 28 },
  body: { flex: 1, gap: Spacing.half },
});
