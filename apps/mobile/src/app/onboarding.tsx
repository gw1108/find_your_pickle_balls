import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MINIMUM_AGE_YEARS, SPORTS, type Sport } from '@pickup/shared';

import { SportChips } from '@/components/chips';
import { DateTimeField } from '@/components/date-time-field';
import { errorMessage } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { clearDraft, loadDraft, saveDraft } from '@/lib/onboarding-draft';
import { supabase } from '@/lib/supabase';

// profiles.birthdate is a DATE column — send the calendar date, not a timestamp
function toDateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// Inverse of toDateString — build a local-time Date (new Date('yyyy-mm-dd')
// would parse as midnight UTC and can shift the calendar day)
function fromDateString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
  const [birthdate, setBirthdate] = useState<Date | null>(null);
  const [sports, setSports] = useState<Sport[]>(
    profile?.sports?.length ? profile.sports : ['pickleball']
  );
  const [busy, setBusy] = useState(false);
  // Draft persistence starts only after the stored draft (if any) is applied,
  // so the defaults never clobber it; completedRef stops a pending debounce
  // from re-saving the draft after submit clears it.
  const [hydrated, setHydrated] = useState(false);
  const completedRef = useRef(false);
  // Prefill precedence per field: user's own edits > stored draft > server
  // profile. touchedRef/draftRef record the first two so the async profile
  // load (which can land after mount — right after sign-in the screen mounts
  // while profile is still null) never clobbers them.
  const touchedRef = useRef({ name: false, sports: false, birthdate: false });
  const draftRef = useRef({ name: false, sports: false, birthdate: false });
  const userId = session!.user.id;

  useEffect(() => {
    let cancelled = false;
    loadDraft(userId).then((draft) => {
      if (cancelled) return;
      if (draft?.displayName && !touchedRef.current.name) {
        draftRef.current.name = true;
        setName(draft.displayName);
      }
      if (draft?.birthdate) {
        draftRef.current.birthdate = true;
        setBirthdate(fromDateString(draft.birthdate));
      }
      if (draft?.sports?.length && !touchedRef.current.sports) {
        draftRef.current.sports = true;
        setSports(draft.sports);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (!touchedRef.current.name && !draftRef.current.name && profile.display_name !== 'New player') {
      setName(profile.display_name);
    }
    if (!touchedRef.current.sports && !draftRef.current.sports && profile.sports?.length) {
      setSports(profile.sports);
    }
  }, [profile]);

  // Local draft: restores the full form after an app close/relaunch. Only
  // persists once the user has actually entered something (or a draft already
  // existed) — otherwise the defaults would be captured as a "draft" and later
  // shadow the server-side values.
  useEffect(() => {
    if (!hydrated) return;
    const touched = touchedRef.current;
    const fromDraft = draftRef.current;
    const hasUserInput =
      touched.name || touched.sports || touched.birthdate ||
      fromDraft.name || fromDraft.sports || fromDraft.birthdate;
    if (!hasUserInput) return;
    const t = setTimeout(() => {
      if (completedRef.current) return;
      saveDraft(userId, {
        displayName: name,
        birthdate: birthdate ? toDateString(birthdate) : undefined,
        sports,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [hydrated, userId, name, birthdate, sports]);

  // Best-effort server draft of name/sports: survives uninstall/reinstall.
  // Never sends birthdate — writing a real birthdate is what completes
  // onboarding, so that stays in submit().
  useEffect(() => {
    if (!hydrated) return;
    const trimmed = name.trim();
    const update: { display_name?: string; sports?: Sport[] } = {};
    // Only fields the user entered (now or in a restored draft) — never echo
    // untouched defaults/prefills back, or they'd overwrite the server copy
    if (
      (touchedRef.current.name || draftRef.current.name) &&
      trimmed.length >= 1 &&
      trimmed.length <= 50
    ) {
      update.display_name = trimmed;
    }
    if ((touchedRef.current.sports || draftRef.current.sports) && sports.length > 0) {
      update.sports = sports;
    }
    if (Object.keys(update).length === 0) return;
    const t = setTimeout(() => {
      if (completedRef.current) return;
      supabase
        .from('profiles')
        .update(update)
        .eq('id', userId)
        .then(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [hydrated, userId, name, sports]);

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert('Add your name', 'Other players see this on events and in chat.');
      return;
    }
    if (!birthdate) {
      Alert.alert('Add your birthdate', 'Select your date of birth.');
      return;
    }
    if (ageInYears(birthdate) < MINIMUM_AGE_YEARS) {
      // 18+ gate (§8) — neutral message, enforced again by the DB constraint
      Alert.alert('Sorry', 'You must be 18 or older to use Pickup.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name.trim(), birthdate: toDateString(birthdate), sports })
        .eq('id', session!.user.id);
      if (error) throw error;
      completedRef.current = true;
      clearDraft(userId);
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
            onChangeText={(t) => {
              touchedRef.current.name = true;
              setName(t);
            }}
            maxLength={50}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold">Birthdate</ThemedText>
          <DateTimeField
            mode="date"
            value={birthdate}
            onChange={(d) => {
              touchedRef.current.birthdate = true;
              setBirthdate(d);
            }}
            placeholder="Select your birthdate"
            maximumDate={new Date()}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Pickup is 18+. Your birthdate is never shown to other players.
          </ThemedText>

          <ThemedText type="smallBold">What do you play?</ThemedText>
          <SportChips
            sports={SPORTS}
            selected={sports}
            onToggle={(s) => {
              touchedRef.current.sports = true;
              setSports((cur) =>
                cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]
              );
            }}
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
