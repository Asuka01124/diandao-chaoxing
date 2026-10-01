import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, useWindowDimensions, type ColorValue } from 'react-native';
import TopTabs, { MaterialTopTabBar } from 'expo-router/js-top-tabs';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from 'tamagui';

const tabNames = ['courses', 'accounts', 'jobs', 'settings'] as const;
const tabIcon = (name: typeof tabNames[number]) => ({ color }: { color: ColorValue }) => <TabIcon name={name} color={String(color)} />;
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => listener.remove();
  }, []);

  return <TopTabs initialRouteName="courses" tabBarPosition="bottom" initialLayout={{ width }} overScrollMode="never" keyboardDismissMode="on-drag"
    tabBar={(props: Parameters<typeof MaterialTopTabBar>[0]) => <View style={{ overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: theme.panel.val, paddingBottom: insets.bottom, shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 8 }}>
      <MaterialTopTabBar {...props} />
    </View>}
    screenOptions={{ swipeEnabled: true, animationEnabled: !reduceMotion, lazy: false, tabBarShowIcon: true,
      tabBarActiveTintColor: theme.color.val, tabBarInactiveTintColor: theme.muted.val, tabBarPressColor: theme.soft.val,
      tabBarIndicatorStyle: { height: 0 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
      tabBarItemStyle: { height: 64 }, tabBarStyle: { backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0 } }}>
    <TopTabs.Screen name="courses" options={{ title: '课程', tabBarIcon: tabIcon('courses') }} />
    <TopTabs.Screen name="accounts" options={{ title: '代签', tabBarIcon: tabIcon('accounts') }} />
    <TopTabs.Screen name="jobs" options={{ title: '任务', tabBarIcon: tabIcon('jobs') }} />
    <TopTabs.Screen name="settings" options={{ title: '设置', tabBarIcon: tabIcon('settings') }} />
  </TopTabs>;
}
