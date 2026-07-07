import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

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
          <AnimatedSplashOverlay />
          <RootNavigator />
        </AuthProvider>
      </KeyboardProvider>
    </ThemeProvider>
  );
}
