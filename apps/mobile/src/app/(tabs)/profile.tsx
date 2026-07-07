import { SKILL_LEVELS, SPORTS, igHandleSchema, type SkillLevel, type Sport } from '@pickup/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, SportChips } from '@/components/chips';
import { errorMessage , SKILL_LABEL, SPORT_LABEL } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import {
  deleteAccount,
  fetchBlockedUsers,
  unblockUser,
  type BlockedUser,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const theme = useTheme();
  const { session, profile, refreshProfile, signOut } = useAuth();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [igHandle, setIgHandle] = useState('');
  const [sports, setSports] = useState<Sport[]>([]);
  const [skills, setSkills] = useState<Partial<Record<Sport, SkillLevel>>>({});
  const [ghostMode, setGhostMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  // blocked list can change from anywhere in the app (chat long-press, event
  // attendee sheet) — refetch whenever the tab regains focus
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      fetchBlockedUsers()
        .then(setBlocked)
        .catch(() => {});
    }, [session])
  );

  // Seed the form from the loaded profile during render (profile can arrive
  // after mount); keyed by user id so a refresh never clobbers in-flight edits.
  if (profile && seededFor !== profile.id) {
    setSeededFor(profile.id);
    setName(profile.display_name);
    setBio(profile.bio ?? '');
    setIgHandle(profile.ig_handle ?? '');
    setSports(profile.sports);
    setSkills(profile.skill_levels ?? {});
    setGhostMode(profile.ghost_mode);
  }

  const save = async () => {
    // IG handle is optional connect-later social proof (§3) — never required
    let ig: string | null = null;
    if (igHandle.trim()) {
      const parsed = igHandleSchema.safeParse(igHandle.trim().replace(/^@/, ''));
      if (!parsed.success) {
        Alert.alert('Invalid Instagram handle', 'Letters, numbers, dots and underscores only.');
        return;
      }
      ig = parsed.data;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: name.trim(),
          bio: bio.trim() || null,
          ig_handle: ig,
          sports,
          skill_levels: skills,
          ghost_mode: ghostMode,
        })
        .eq('id', session!.user.id);
      if (error) throw error;
      await refreshProfile();
      Alert.alert('Saved');
    } catch (e) {
      Alert.alert('Could not save', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Profile</ThemedText>

          <ThemedText type="smallBold">Display name</ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={50}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />

          <ThemedText type="smallBold">Bio</ThemedText>
          <TextInput
            value={bio}
            onChangeText={setBio}
            maxLength={300}
            multiline
            placeholder="A line about you"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              styles.multiline,
              { color: theme.text, borderColor: theme.backgroundSelected },
            ]}
          />

          <ThemedText type="smallBold">Sports</ThemedText>
          <SportChips
            sports={SPORTS}
            selected={sports}
            onToggle={(s) =>
              setSports((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
            }
          />

          {sports.map((sport) => (
            <View key={sport} style={styles.skillBlock}>
              <ThemedText type="small" themeColor="textSecondary">
                {SPORT_LABEL[sport]} skill
              </ThemedText>
              <View style={styles.skillRow}>
                {SKILL_LEVELS.map((lvl) => (
                  <Chip
                    key={lvl}
                    label={SKILL_LABEL[lvl]}
                    selected={skills[sport] === lvl}
                    onPress={() =>
                      setSkills((cur) => ({
                        ...cur,
                        [sport]: cur[sport] === lvl ? undefined : lvl,
                      }))
                    }
                  />
                ))}
              </View>
            </View>
          ))}

          <ThemedText type="smallBold">Instagram (optional)</ThemedText>
          <TextInput
            value={igHandle}
            onChangeText={setIgHandle}
            autoCapitalize="none"
            placeholder="@yourhandle"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Adds a “View on Instagram” link to your profile. Never required.
          </ThemedText>

          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <ThemedText type="smallBold">Ghost mode</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Hide you from live court check-in counts.
              </ThemedText>
            </View>
            <Switch value={ghostMode} onValueChange={setGhostMode} />
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={save}
            style={[styles.button, { backgroundColor: theme.text }]}>
            <ThemedText style={{ color: theme.background }}>
              {busy ? 'Saving…' : 'Save'}
            </ThemedText>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={signOut}>
            <ThemedText type="link" themeColor="textSecondary" style={styles.signOut}>
              Sign out
            </ThemedText>
          </Pressable>

          {blocked.length > 0 && (
            <>
              <ThemedText type="smallBold" style={styles.sectionTitle}>
                Blocked players
              </ThemedText>
              {blocked.map((b) => (
                <View key={b.blocked_id} style={styles.blockedRow}>
                  <ThemedText type="small" style={styles.blockedName}>
                    {b.display_name}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={async () => {
                      try {
                        await unblockUser(session!.user.id, b.blocked_id);
                        setBlocked((cur) =>
                          cur.filter((x) => x.blocked_id !== b.blocked_id)
                        );
                      } catch (e) {
                        Alert.alert('Could not unblock', errorMessage(e));
                      }
                    }}>
                    <ThemedText type="link" themeColor="textSecondary">
                      Unblock
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {/* account deletion in-app — Apple 5.1.1(v), §8 */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              Alert.alert(
                'Delete your account?',
                'This permanently removes your profile, events, chats, and check-ins. It cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete forever',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteAccount();
                        await signOut();
                      } catch (e) {
                        Alert.alert('Could not delete account', errorMessage(e));
                      }
                    },
                  },
                ]
              );
            }}>
            <ThemedText type="link" style={[styles.signOut, { color: theme.danger }]}>
              Delete account
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  skillBlock: { gap: Spacing.two },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  switchLabel: { flex: 1, gap: Spacing.half },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  signOut: { textAlign: 'center' },
  sectionTitle: { marginTop: Spacing.three },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  blockedName: { flex: 1 },
});
