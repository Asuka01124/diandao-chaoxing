import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TamaguiProvider, Theme } from 'tamagui';
import config from '../tamagui.config';
import { VaultProvider, useVault } from '../src/state';

function ThemedNavigator() {
  const system = useColorScheme();
  const { data } = useVault();
  const appearance = data?.settings.appearance ?? 'system';
  const name = appearance === 'system' ? system === 'dark' ? 'dark' : 'light' : appearance;
  return <Theme name={name}><StatusBar style={name === 'dark' ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false }} /></Theme>;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return <TamaguiProvider config={config} defaultTheme={scheme === 'dark' ? 'dark' : 'light'}><VaultProvider><ThemedNavigator /></VaultProvider></TamaguiProvider>;
}
