import { DarkTheme, DefaultTheme, ThemeProvider , Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerForPush, useNotificationDeepLinks } from '@/lib/notifications';
import { UnreadProvider } from '@/lib/unread';

SplashScreen.preventAutoHideAsync();

/** Push registration + notification deep links (§5) once signed in. */
function PushSetup() {
  const { session, needsOnboarding } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;
  const ready = !!userId && !needsOnboarding;

  useEffect(() => {
    if (ready && userId) registerForPush(userId);
  }, [ready, userId]);

  useNotificationDeepLinks(
    useCallback(
      (channelId: string) => {
        router.push({ pathname: '/chat/[id]', params: { id: channelId } });
      },
      [router]
    )
  );
  return null;
}

function RootNavigator() {
  const { session, loading, needsOnboarding } = useAuth();
  if (loading) return null; // splash overlay still covers the screen

  const signedIn = !!session;
  const ready = signedIn && !needsOnboarding;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        <Stack.Screen name="(tabs)" />
        {/* invite-link entry (/e/<id> universal link or pickup://e/<id>) —
            guarded so a signed-out open falls back to sign-in instead of
            redirecting into a removed screen (renders blank) */}
        <Stack.Screen name="e/[eventId]" />
        <Stack.Screen name="event/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="create-event"
          options={{ presentation: 'modal', headerShown: true, title: 'New game' }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* SDK 57 Android is edge-to-edge: both bars are translucent */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <AuthProvider>
          <UnreadProvider>
            <AnimatedSplashOverlay />
            <PushSetup />
            <RootNavigator />
          </UnreadProvider>
        </AuthProvider>
      </KeyboardProvider>
    </ThemeProvider>
  );
}
