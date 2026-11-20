import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { Activity } from '@sign/shared';
import { SectionTitle } from '../../ui';
import { courseKey, type OngoingCourseActivity } from './course-priority';

const kindLabels: Record<Activity['kind'], string> = {
  click: '普通签到', location: '位置签到', photo: '照片签到', qr: '二维码签到',
  code: '签到码签到', gesture: '手势签到', unknown: '签到活动',
};

export function OngoingAttendanceCard({ entries, onPress, onQuickSign }: {
  entries: OngoingCourseActivity[]; onPress: (activity: Activity) => void; onQuickSign?: (activity: Activity) => void;
}) {
  if (!entries.length) return null;
  return <YStack>
    <SectionTitle>进行中的签到</SectionTitle>
    {entries.map(({ course, activity }) => {
        const repeated = entries.some(item => item.activity.id !== activity.id && courseKey(item.course) === courseKey(course));
        const detail = repeated ? activity.title : undefined;
        const quickHandler = onQuickSign && activity.kind !== 'unknown' ? () => onQuickSign(activity) : undefined;
        return <XStack key={`${courseKey(course)}:${activity.id}`} minHeight={60} paddingLeft={7} alignItems="center" gap={12}>
          <Pressable onPress={() => onPress(activity)} accessibilityRole="button"
            accessibilityLabel={`查看 ${course.name} 的 ${activity.title || kindLabels[activity.kind]}`}
            style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.62 : 1 })}>
            <YStack width={6} height={6} borderRadius={3} backgroundColor="$focusDot" />
            <YStack flex={1} gap={3}>
              <Text color="$color" fontSize={15} lineHeight={21} fontWeight="500" numberOfLines={1}>{course.name}</Text>
              {!!detail && <Text color="$muted" fontSize={14} lineHeight={20} numberOfLines={1}>{detail}</Text>}
            </YStack>
          </Pressable>
          {quickHandler && <Pressable onPress={quickHandler} accessibilityRole="button" accessibilityLabel={`去签到 ${course.name}`}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, opacity: pressed ? 0.72 : 1 })}>
            <Text color="$color" fontSize={14} lineHeight={20} fontWeight="500">签到</Text>
          </Pressable>}
        </XStack>;
      })}
  </YStack>;
}
