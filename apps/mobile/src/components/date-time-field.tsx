import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  mode: 'date' | 'time';
  /** null = nothing chosen yet; the field shows `placeholder` until the user picks. */
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

function formatValue(mode: Props['mode'], d: Date): string {
  return mode === 'time'
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// The Android date dialog (Compose) speaks midnight-UTC calendar days: it
// highlights the UTC day of the value it's given and returns the picked day
// at 00:00 UTC. Shift on the way in and back out so callers only ever see
// local dates. The time dialog uses the device zone on both sides — no shift.
const toUtcDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const fromUtcDay = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// The native layer defaults the Android clock to 24h; follow the locale instead.
const uses24HourClock = !/[ap]m/i.test(new Date(2000, 0, 1, 13).toLocaleTimeString());

/**
 * Native platform date/time selection. iOS renders SwiftUI's compact picker
 * inline (a tappable pill, like Settings); Android renders an input-styled
 * field that opens the Material date/time dialog — the dialog opens on mount,
 * so it stays unmounted until tapped.
 */
export function DateTimeField({ mode, value, onChange, placeholder, minimumDate, maximumDate }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // What the picker starts on when nothing is chosen yet.
  const initial = value ?? maximumDate ?? new Date();

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.iosRow}>
        <DateTimePicker
          value={initial}
          mode={mode}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={(_event, date) => onChange(date)}
        />
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.field, { borderColor: theme.backgroundSelected }]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'}>
          {value ? formatValue(mode, value) : (placeholder ?? formatValue(mode, initial))}
        </ThemedText>
      </Pressable>
      {open && (
        <DateTimePicker
          value={mode === 'date' ? toUtcDay(initial) : initial}
          mode={mode}
          is24Hour={uses24HourClock}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onValueChange={(_event, date) => {
            setOpen(false);
            onChange(mode === 'date' ? fromUtcDay(date) : date);
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  iosRow: { alignItems: 'flex-start' },
  field: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
