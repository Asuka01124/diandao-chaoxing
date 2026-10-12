import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Activity } from '@sign/shared';
import { CourseIcon } from './course-card';
import { courseKey, type OngoingCourseActivity } from './course-priority';

const kindLabels: Record<Activity['kind'], string> = {
  click: '普通签到', location: '位置签到', photo: '照片签到', qr: '二维码签到',
  code: '签到码签到', gesture: '手势签到', unknown: '签到活动',
};

export function OngoingAttendanceCard({ entries, onPress }: { entries: OngoingCourseActivity[]; onPress: (activity: Activity) => void }) {
  const theme = useTheme();
  if (!entries.length) return null;
  return <YStack marginTop={20} backgroundColor="$panel" borderRadius={22}
    shadowColor="#000000" shadowOpacity={0.045} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    <YStack borderRadius={22} overflow="hidden">
      <XStack backgroundColor="$ongoingHeader" paddingHorizontal={16} paddingVertical={15} alignItems="center" justifyContent="space-between" gap={10}>
        <XStack flex={1} alignItems="center" gap={9}>
          <YStack width={7} height={7} borderRadius={4} backgroundColor="$muted" />
          <Text flex={1} color="$color" fontSize={15} lineHeight={22} fontWeight="500" accessibilityRole="header">进行中的签到</Text>
        </XStack>
        <Text color="$muted" fontSize={12} lineHeight={18} accessibilityLiveRegion="polite">{entries.length} 项</Text>
      </XStack>
      {entries.map(({ course, activity }, index) => {
        const repeated = entries.some(item => item.activity.id !== activity.id && courseKey(item.course) === courseKey(course));
        const detail = [kindLabels[activity.kind], repeated ? activity.title : course.teacher].filter(Boolean).join(' · ');
        return <Pressable key={`${courseKey(course)}:${activity.id}`} onPress={() => onPress(activity)}
          accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的 ${activity.title || kindLabels[activity.kind]}，${detail}`}
          style={({ pressed }) => ({ backgroundColor: pressed ? theme.soft.val : theme.panel.val })}>
          <XStack minHeight={76} paddingHorizontal={16} paddingVertical={17} alignItems="center" gap={11}
            borderTopWidth={index ? 1 : 0} borderColor="$separator">
            <YStack width={35} height={35} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center">
              <CourseIcon name={course.name} color={theme.muted.val} surface={theme.soft.val} size={23} />
            </YStack>
            <YStack flex={1} gap={5}>
              <Text color="$color" fontSize={15} lineHeight={22} fontWeight="500" numberOfLines={2}>{course.name}</Text>
              <Text color="$muted" fontSize={12} lineHeight={18} numberOfLines={2}>{detail}</Text>
            </YStack>
            <XStack alignItems="center" gap={3}>
              <Text color="$muted" fontSize={12} lineHeight={18}>查看</Text>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Path d="m9 5 7 7-7 7" stroke={theme.muted.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </XStack>
          </XStack>
        </Pressable>;
      })}
    </YStack>
  </YStack>;
}
