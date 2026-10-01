import { useMemo } from 'react';
import { router, Tabs, useSegments } from 'expo-router';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from 'tamagui';

const tabNames = ['courses', 'accounts', 'jobs', 'settings'] as const;
const icon = (glyph: string) => ({ color }: { color: import('react-native').ColorValue }) => <Text style={{ color, fontSize: 23, fontWeight: '500', lineHeight: 27 }}>{glyph}</Text>;

export default function TabsLayout() {
  const theme = useTheme();
  const segments = useSegments();
  const activeIndex = tabNames.findIndex(name => segments.includes(name));
  const swipe = useMemo(() => Gesture.Pan()
    .enabled(activeIndex >= 0)
    .activeOffsetX(activeIndex === 0 ? [-24, 9999] : activeIndex === tabNames.length - 1 ? [-9999, 24] : [-24, 24])
    .failOffsetY([-20, 20])
    .onEnd(({ translationX, velocityX }) => {
      if (activeIndex < 0 || (Math.abs(translationX) < 72 && !(Math.abs(translationX) > 35 && Math.abs(velocityX) > 700))) return;
      const next = tabNames[activeIndex + (translationX < 0 ? 1 : -1)];
      if (next) router.navigate(`/(tabs)/${next}`);
    })
    .runOnJS(true), [activeIndex]);

  return <GestureDetector gesture={swipe}><View style={{ flex: 1 }}>
    <Tabs initialRouteName="courses" screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.brand.val, tabBarInactiveTintColor: theme.muted.val, tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 3 }, tabBarStyle: { backgroundColor: theme.panel.val, borderTopColor: theme.separator.val, borderTopWidth: 0.5, height: 62, paddingTop: 6 } }}>
      <Tabs.Screen name="courses" options={{ title: '课程', tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="accounts" options={{ title: '代签', tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="jobs" options={{ title: '任务', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: icon('⚙') }} />
    </Tabs>
  </View></GestureDetector>;
}
