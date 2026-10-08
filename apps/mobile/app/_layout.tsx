import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { TamaguiProvider, Theme } from 'tamagui';
import config from '../tamagui.config';
import { VaultProvider, useVault } from '../src/state';
import { StartupSplash } from '../src/features/startup/startup-splash';
import { FeedbackProvider } from '../src/ui';

void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 0, fade: false });

function ThemedNavigator() {
  const system = useColorScheme();
  const { data } = useVault();
  const appearance = data?.settings.appearance ?? 'system';
  const name = appearance === 'system' ? system === 'dark' ? 'dark' : 'light' : appearance;
  return <Theme name={name}><FeedbackProvider><StatusBar style={name === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false }} /></FeedbackProvider></Theme>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return <GestureHandlerRootView style={{ flex: 1 }}><TamaguiProvider config={config} defaultTheme={scheme === 'dark' ? 'dark' : 'light'}><VaultProvider><ThemedNavigator /><StartupSplash /></VaultProvider></TamaguiProvider></GestureHandlerRootView>;
}
