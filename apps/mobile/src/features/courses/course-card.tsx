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
    <YStack flex={1} minHeight={202} backgroundColor="$panel" borderWidth={1} borderColor="$glassBorder" borderRadius={23} overflow="hidden" shadowColor="#233968" shadowOpacity={0.07} shadowRadius={18} shadowOffset={{ width: 0, height: 7 }} elevation={2}>
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} resizeMode="cover" style={{ width: '100%', height: 118, backgroundColor: '#DCE7F7' }} onError={() => setImageFailed(true)} />
        : <YStack width="100%" height={118} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={34} fontWeight="700">{course.name.slice(0, 1)}</Text></YStack>}
      <YStack paddingHorizontal={14} paddingTop={12} paddingBottom={15} gap={5}>
        <Text fontSize={15} lineHeight={21} fontWeight="700" color="$color" numberOfLines={2}>{course.name}</Text>
        {!!course.teacher && <Text fontSize={12} color="$muted" numberOfLines={1}>{course.teacher}</Text>}
      </YStack>
    </YStack>
  </Pressable>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
    <XStack minHeight={88} alignItems="center" paddingHorizontal={15} paddingVertical={13} backgroundColor="$panel" borderWidth={1} borderColor="$glassBorder" borderRadius={22} gap={15} shadowColor="#233968" shadowOpacity={0.06} shadowRadius={15} shadowOffset={{ width: 0, height: 6 }} elevation={1}>
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: '#DCE7F7' }} onError={() => setImageFailed(true)} />
        : <YStack width={58} height={58} borderRadius={16} backgroundColor="$soft" borderWidth={1} borderColor="$glassBorder" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={24} fontWeight="700">{course.name.slice(0, 1)}</Text></YStack>}
      <YStack flex={1} gap={5}><Text fontSize={16} lineHeight={22} fontWeight="700" color="$color" numberOfLines={2}>{course.name}</Text>{!!course.teacher && <Text fontSize={12} color="$muted" numberOfLines={1}>{course.teacher}</Text>}</YStack>
      <Text color="$brand" fontSize={21}>›</Text>
    </XStack>
  </Pressable>;
}
