import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  const colorScheme = useColorScheme();
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

  const signInWithApple = async () => {
    setBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('Apple returned no identity token');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      // Apple provides the name only on the very first authorization, and only
      // on-device — persist it now or lose it. The eq('display_name', ...)
      // guard limits the update to the handle_new_user stub row; errors are
      // ignored so a profile hiccup can't fail an otherwise good sign-in.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (name && data.user) {
        await supabase
          .from('profiles')
          .update({ display_name: name })
          .eq('id', data.user.id)
          .eq('display_name', 'New player');
      }
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
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

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              colorScheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={Spacing.three}
            style={styles.appleButton}
            onPress={busy ? () => {} : signInWithApple}
          />
        )}

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
  // Native Apple button needs an explicit height; 48 matches the Google
  // button's paddingVertical footprint.
  appleButton: { height: 48 },
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
