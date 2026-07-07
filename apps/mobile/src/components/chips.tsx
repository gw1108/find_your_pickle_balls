import { Pressable, StyleSheet, View } from 'react-native';
import type { SkillLevel, Sport } from '@pickup/shared';
import { SKILL_LEVELS } from '@pickup/shared';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SKILL_LABEL, SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';

type ChipProps = { label: string; selected: boolean; onPress: () => void };

export function Chip({ label, selected, onPress }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function SportChips({
  sports,
  selected,
  onToggle,
}: {
  sports: readonly Sport[];
  selected: Sport[];
  onToggle: (sport: Sport) => void;
}) {
  return (
    <View style={styles.row}>
      {sports.map((s) => (
        <Chip
          key={s}
          label={`${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}`}
          selected={selected.includes(s)}
          onPress={() => onToggle(s)}
        />
      ))}
    </View>
  );
}

export function SkillChips({
  selected,
  onSelect,
}: {
  selected: SkillLevel | null;
  onSelect: (skill: SkillLevel | null) => void;
}) {
  return (
    <View style={styles.row}>
      {SKILL_LEVELS.map((s) => (
        <Chip
          key={s}
          label={SKILL_LABEL[s]}
          selected={selected === s}
          onPress={() => onSelect(selected === s ? null : s)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
});
