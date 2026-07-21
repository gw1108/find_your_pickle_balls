import { SPORTS, igHandleSchema, type Sport } from '@pickup/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SportChips } from '@/components/chips';
import { errorMessage } from '@/lib/format';
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
