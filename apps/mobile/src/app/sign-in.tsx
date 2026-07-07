import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = Linking.createURL('auth-callback');

/** Handle both PKCE (?code=) and implicit (#access_token=) callback shapes. */
async function createSessionFromUrl(url: string) {
  const parsed = Linking.parse(url.replace('#', '?'));
  const params = parsed.queryParams ?? {};
  if (typeof params.code === 'string') {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }
  if (typeof params.access_token === 'string' && typeof params.refresh_token === 'string') {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
  }
}

export default function SignInScreen() {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === 'success') await createSessionFromUrl(result.url);
    } catch (e) {
      Alert.alert('Sign-in failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Dev-only email path so agent-driven E2E on the Android rig (§9.1) can log
  // in without a Google account in the emulator browser.
  const signInWithEmail = async (mode: 'in' | 'up') => {
    setBusy(true);
    try {
      const fn =
        mode === 'in'
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error } = await fn;
      if (error) throw error;
    } catch (e) {
      Alert.alert('Sign-in failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
            Pickup
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tagline}>
            Find a game near you and be in the chat in seconds.
          </ThemedText>
        </ThemedView>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={signInWithGoogle}
          style={[styles.button, { backgroundColor: theme.text }]}>
          <ThemedText style={{ color: theme.background }}>Continue with Google</ThemedText>
        </Pressable>

        {__DEV__ && (
          <ThemedView type="backgroundElement" style={styles.devBox}>
            <ThemedText type="smallBold">Dev sign-in</ThemedText>
            <TextInput
              placeholder="email"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <TextInput
              placeholder="password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <ThemedView type="backgroundElement" style={styles.devRow}>
              <Pressable disabled={busy} onPress={() => signInWithEmail('in')}>
                <ThemedText type="linkPrimary">Sign in</ThemedText>
              </Pressable>
              <Pressable disabled={busy} onPress={() => signInWithEmail('up')}>
                <ThemedText type="linkPrimary">Sign up</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three },
  title: { textAlign: 'center' },
  tagline: { textAlign: 'center' },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  devBox: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  devRow: { flexDirection: 'row', gap: Spacing.four },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
