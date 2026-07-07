import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MINIMUM_AGE_YEARS, SPORTS, type Sport } from '@pickup/shared';

import { SportChips } from '@/components/chips';
import { errorMessage } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

function parseBirthdate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageInYears(birthdate: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthdate.getMonth() ||
    (now.getMonth() === birthdate.getMonth() && now.getDate() < birthdate.getDate());
  return beforeBirthday ? age - 1 : age;
}

export default function OnboardingScreen() {
  const theme = useTheme();
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name === 'New player' ? '' : (profile?.display_name ?? ''));
  const [birthdate, setBirthdate] = useState('');
  const [sports, setSports] = useState<Sport[]>(['pickleball']);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const dob = parseBirthdate(birthdate);
    if (!name.trim()) {
      Alert.alert('Add your name', 'Other players see this on events and in chat.');
      return;
    }
    if (!dob) {
      Alert.alert('Invalid date', 'Enter your birthdate as YYYY-MM-DD.');
      return;
    }
    if (ageInYears(dob) < MINIMUM_AGE_YEARS) {
      // 18+ gate (§8) — neutral message, enforced again by the DB constraint
      Alert.alert('Sorry', 'You must be 18 or older to use Pickup.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim(), birthdate, sports })
        .eq('id', session!.user.id);
      if (error) throw error;
      await refreshProfile(); // flips needsOnboarding → router guard swaps stacks
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Almost there</ThemedText>

          <ThemedText type="smallBold">Your name</ThemedText>
          <TextInput
            placeholder="Display name"
            placeholderTextColor={theme.textSecondary}
            value={name}
            onChangeText={setName}
            maxLength={50}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold">Birthdate</ThemedText>
          <TextInput
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            value={birthdate}
            onChangeText={setBirthdate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Pickup is 18+. Your birthdate is never shown to other players.
          </ThemedText>

          <ThemedText type="smallBold">What do you play?</ThemedText>
          <SportChips
            sports={SPORTS}
            selected={sports}
            onToggle={(s) =>
              setSports((cur) =>
                cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
              )
            }
          />

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={submit}
            style={[styles.button, { backgroundColor: theme.text }]}>
            <ThemedText style={{ color: theme.background }}>
              {busy ? 'Saving…' : "Let's play"}
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.three,
  },
});
