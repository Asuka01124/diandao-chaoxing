import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from 'tamagui';
const icon = (glyph: string) => ({ color }: { color: import('react-native').ColorValue }) => <Text style={{ color, fontSize: 23, fontWeight: '500', lineHeight: 27 }}>{glyph}</Text>;
export default function TabsLayout() { const theme = useTheme(); return <Tabs initialRouteName="courses" screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.brand.val, tabBarInactiveTintColor: theme.muted.val, tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 3 }, tabBarStyle: { backgroundColor: theme.panel.val, borderTopColor: theme.separator.val, borderTopWidth: 0.5, height: 62, paddingTop: 6 } }}>
  <Tabs.Screen name="courses" options={{ title: '课程', tabBarIcon: icon('▤') }} />
  <Tabs.Screen name="accounts" options={{ title: '账号', tabBarIcon: icon('◉') }} />
  <Tabs.Screen name="jobs" options={{ title: '任务', tabBarIcon: icon('✓') }} />
  <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: icon('⚙') }} />
</Tabs>; }
