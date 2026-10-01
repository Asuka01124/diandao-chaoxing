import { useMemo } from 'react';
import { router, Tabs, useSegments } from 'expo-router';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme, useThemeName } from 'tamagui';

const tabNames = ['courses', 'accounts', 'jobs', 'settings'] as const;
function TabIcon({ name, color }: { name: typeof tabNames[number]; color: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {name === 'courses' && <><Rect x="3.5" y="4" width="17" height="16" rx="3" stroke={color} strokeWidth="1.8" /><Path d="M8 4v16M11 9h6M11 13h6M11 17h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></>}
    {name === 'accounts' && <><Circle cx="9" cy="9" r="3" stroke={color} strokeWidth="1.8" /><Path d="M3.5 19c.5-3 2.5-4.5 5.5-4.5s5 1.5 5.5 4.5M16.5 6.5a3 3 0 0 1 0 5.5M17 15c2.1.2 3.3 1.5 3.5 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></>}
    {name === 'jobs' && <><Rect x="4" y="3.5" width="16" height="17" rx="3" stroke={color} strokeWidth="1.8" /><Path d="m8 12 2.4 2.4L16 9M8 6.5h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></>}
    {name === 'settings' && <><Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" /><Path d="M10 3.5h4l.6 2.2 1.5.9 2.2-.6 2 3.4-1.6 1.6v2l1.6 1.6-2 3.4-2.2-.6-1.5.9-.6 2.2h-4l-.6-2.2-1.5-.9-2.2.6-2-3.4 1.6-1.6v-2L3.7 9.4l2-3.4 2.2.6 1.5-.9L10 3.5Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" /></>}
  </Svg>;
}

export default function TabsLayout() {
  const theme = useTheme();
  const dark = useThemeName() === 'dark';
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
    <Tabs initialRouteName="courses" screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.brand.val, tabBarInactiveTintColor: theme.muted.val, tabBarBackground: () => <View style={{ flex: 1, overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.panel.val }}><BlurView intensity={54} tint={dark ? 'dark' : 'light'} style={{ flex: 1 }} /></View>, tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginBottom: 3, letterSpacing: 0.4 }, tabBarStyle: { backgroundColor: 'transparent', borderTopColor: theme.glassBorder.val, borderTopWidth: 1, height: 70, paddingTop: 8, elevation: 0 } }}>
      <Tabs.Screen name="courses" options={{ title: '课程', tabBarIcon: ({ color }) => <TabIcon name="courses" color={String(color)} /> }} />
      <Tabs.Screen name="accounts" options={{ title: '代签', tabBarIcon: ({ color }) => <TabIcon name="accounts" color={String(color)} /> }} />
      <Tabs.Screen name="jobs" options={{ title: '任务', tabBarIcon: ({ color }) => <TabIcon name="jobs" color={String(color)} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color }) => <TabIcon name="settings" color={String(color)} /> }} />
    </Tabs>
  </View></GestureDetector>;
}
