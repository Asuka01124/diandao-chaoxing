import { useEffect, useState } from 'react';
import { Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { Course, ProviderSession } from '@sign/shared';
import { cachedCourseCover } from './course-cover';

export function CourseCard({ course, session, onPress, layout = 'list' }: { course: Course; session: ProviderSession; onPress: () => void; layout?: 'list' | 'grid' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setImageFailed(false); setImageUri(null);
    if (course.imageUrl) void cachedCourseCover(session, course.imageUrl).then(uri => { if (active) setImageUri(uri); }).catch(() => { if (active) setImageFailed(true); });
    return () => { active = false; };
  }, [course.imageUrl, session.userId]);
  if (layout === 'grid') return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`}
    style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
    <YStack flex={1} minHeight={188} backgroundColor="$panel" borderWidth={1} borderColor="$separator" borderRadius={18} overflow="hidden">
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} resizeMode="cover" style={{ width: '100%', height: 112, backgroundColor: '#ececec' }} onError={() => setImageFailed(true)} />
        : <YStack width="100%" height={112} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={34} fontWeight="700">{course.name.slice(0, 1)}</Text></YStack>}
      <YStack paddingHorizontal={12} paddingTop={10} paddingBottom={12} gap={3}>
        <Text fontSize={15} lineHeight={20} fontWeight="600" color="$color" numberOfLines={2}>{course.name}</Text>
        {!!course.teacher && <Text fontSize={12} color="$muted" numberOfLines={1}>{course.teacher}</Text>}
      </YStack>
    </YStack>
  </Pressable>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`} style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}>
    <XStack minHeight={80} alignItems="center" paddingHorizontal={14} paddingVertical={12} borderBottomWidth={1} borderColor="$separator" gap={14}>
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#ececec' }} onError={() => setImageFailed(true)} />
        : <YStack width={56} height={56} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={25} fontWeight="700">{course.name.slice(0, 1)}</Text></YStack>}
      <YStack flex={1} gap={4}><Text fontSize={16} fontWeight="600" color="$color" numberOfLines={2}>{course.name}</Text>{!!course.teacher && <Text fontSize={13} color="$muted" numberOfLines={1}>{course.teacher}</Text>}</YStack>
      <Text color="$muted" fontSize={22}>›</Text>
    </XStack>
  </Pressable>;
}
