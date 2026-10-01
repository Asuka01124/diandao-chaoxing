import { useEffect, useState } from 'react';
import { Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { Course, ProviderSession } from '@sign/shared';
import { cachedCourseCover } from './course-cover';

export function CourseCard({ course, session, onPress }: { course: Course; session: ProviderSession; onPress: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setImageFailed(false); setImageUri(null);
    if (course.imageUrl) void cachedCourseCover(session, course.imageUrl).then(uri => { if (active) setImageUri(uri); }).catch(() => { if (active) setImageFailed(true); });
    return () => { active = false; };
  }, [course.imageUrl, session.userId]);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`}>
    <XStack minHeight={80} alignItems="center" paddingHorizontal={14} paddingVertical={12} borderBottomWidth={1} borderColor="$separator" gap={14}>
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: '#ececec' }} onError={() => setImageFailed(true)} />
        : <YStack width={56} height={56} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={25} fontWeight="700">{course.name.slice(0, 1)}</Text></YStack>}
      <YStack flex={1} gap={4}><Text fontSize={16} fontWeight="600" color="$color" numberOfLines={2}>{course.name}</Text>{!!course.teacher && <Text fontSize={13} color="$muted" numberOfLines={1}>{course.teacher}</Text>}</YStack>
      <Text color="$muted" fontSize={22}>›</Text>
    </XStack>
  </Pressable>;
}
