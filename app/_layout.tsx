import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Silent background update check on every app launch
  useEffect(() => {
    if (__DEV__) return; // OTA updates only work in production builds
    Updates.checkForUpdateAsync()
      .then(update => {
        if (!update.isAvailable) return;
        return Updates.fetchUpdateAsync().then(() => {
          Alert.alert(
            'Update ready',
            'A new version has been downloaded. Restart to apply it.',
            [
              { text: 'Later' },
              { text: 'Restart now', style: 'default', onPress: () => Updates.reloadAsync() },
            ]
          );
        });
      })
      .catch(() => {}); // Silent fail — never disrupt startup
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
