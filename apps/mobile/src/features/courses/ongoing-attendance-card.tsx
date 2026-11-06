import { Pressable } from 'react-native';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Activity } from '@sign/shared';
import { CourseIcon } from './course-card';
import { courseKey, type OngoingCourseActivity } from './course-priority';

const kindLabels: Record<Activity['kind'], string> = {
  click: '普通签到', location: '位置签到', photo: '照片签到', qr: '二维码签到',
  code: '签到码签到', gesture: '手势签到', unknown: '签到活动',
};

export function OngoingAttendanceCard({ entries, onPress, onQuickSign }: {
  entries: OngoingCourseActivity[]; onPress: (activity: Activity) => void; onQuickSign?: (activity: Activity) => void;
}) {
  const theme = useTheme();
  if (!entries.length) return null;
  return <YStack marginTop={4} marginBottom={6} backgroundColor="$panel" borderRadius={20}
    shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    <YStack borderRadius={20} overflow="hidden">
      <XStack backgroundColor="$ongoingHeader" paddingHorizontal={16} paddingVertical={11} alignItems="center" justifyContent="space-between" gap={10}>
        <XStack flex={1} alignItems="center" gap={8}>
          <YStack width={7} height={7} borderRadius={4} backgroundColor="$success" />
          <Text flex={1} color="$success" fontSize={12} lineHeight={18} fontWeight="500" accessibilityRole="header">进行中的签到</Text>
        </XStack>
        <Text color="$success" fontSize={12} lineHeight={18} fontWeight="500" accessibilityLiveRegion="polite">{entries.length} 项</Text>
      </XStack>
      {entries.map(({ course, activity }, index) => {
        const repeated = entries.some(item => item.activity.id !== activity.id && courseKey(item.course) === courseKey(course));
        const detail = [kindLabels[activity.kind], repeated ? activity.title : course.teacher].filter(Boolean).join(' · ');
        const quickHandler = onQuickSign && activity.kind !== 'unknown' ? () => onQuickSign(activity) : () => onPress(activity);
        return <XStack key={`${courseKey(course)}:${activity.id}`} minHeight={74} paddingHorizontal={16} paddingVertical={14} alignItems="center" gap={12}
          borderTopWidth={index ? 1 : 0} borderColor="$separator">
          <Pressable onPress={() => onPress(activity)} accessibilityRole="button"
            accessibilityLabel={`查看 ${course.name} 的 ${activity.title || kindLabels[activity.kind]}，${detail}`}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.62 : 1 })}>
            <YStack width={38} height={38} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center">
              <CourseIcon name={course.name} color={theme.muted.val} surface={theme.soft.val} size={22} />
            </YStack>
            <YStack flex={1} gap={3}>
              <Text color="$color" fontSize={15} lineHeight={21} fontWeight="500" numberOfLines={1}>{course.name}</Text>
              <Text color="$muted" fontSize={12} lineHeight={17} numberOfLines={1}>{detail}</Text>
            </YStack>
          </Pressable>
          <Pressable onPress={quickHandler} accessibilityRole="button" accessibilityLabel={`去签到 ${course.name}`}
            style={({ pressed }) => ({ backgroundColor: theme.actionSurface.val, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, opacity: pressed ? 0.72 : 1 })}>
            <Text color="$actionText" fontSize={12} lineHeight={16} fontWeight="500">去签到 ›</Text>
          </Pressable>
        </XStack>;
      })}
    </YStack>
  </YStack>;
}
