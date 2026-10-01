import { useEffect, useState } from 'react';
import { Image, Pressable } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Course, ProviderSession } from '@sign/shared';
import { cachedCourseCover } from './course-cover';

function CourseIcon({ name, color, surface }: { name: string; color: string; surface: string }) {
  const common = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const kind = /人工智能|AI|机器学习/.test(name) ? 'network' : /形势|政策|法律|思政/.test(name) ? 'balance' : /检索|文献|论文|研究/.test(name) ? 'search' : /团队|沟通|管理|心理/.test(name) ? 'people' : 'book';
  return <Svg width={48} height={48} viewBox="0 0 48 48" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {kind === 'network' && <>
      <Path d="M9 16 24 8l15 12-9 17-17-3L9 16Zm0 0 21 21M24 8l-11 26m26-14-26 14M9 16l30 4" {...common} />
      {[[9,16],[24,8],[39,20],[30,37],[13,34],[24,23]].map(([cx,cy], i) => <Circle key={i} cx={cx} cy={cy} r="3.5" fill={surface} {...common} />)}
    </>}
    {kind === 'balance' && <>
      <Path d="M24 7v34M11 13h26M16 13 9 28h14l-7-15Zm16 0-7 15h14l-7-15ZM7 29c1 4 4 6 9 6s8-2 9-6m-2 0c1 4 4 6 9 6s8-2 9-6M14 41h20" {...common} />
      <Circle cx="24" cy="7" r="2" {...common} />
    </>}
    {kind === 'search' && <>
      <Rect x="7" y="8" width="27" height="32" rx="3" {...common} /><Path d="M12 15h17M12 21h14M12 27h11M12 33h9" {...common} />
      <Circle cx="31" cy="31" r="9" fill={surface} {...common} /><Path d="m37.5 37.5 6 6" {...common} />
    </>}
    {kind === 'people' && <>
      <Circle cx="24" cy="16" r="6" {...common} /><Path d="M12 40c0-8 4-12 12-12s12 4 12 12M12 14a5 5 0 0 0-3 9M6 38c0-5 2-8 6-10m24-14a5 5 0 0 1 3 9m3 15c0-5-2-8-6-10" {...common} />
    </>}
    {kind === 'book' && <>
      <Path d="M24 11c-5-3-11-3-17-1v29c6-2 12-2 17 1 5-3 11-3 17-1V10c-6-2-12-2-17 1Zm0 0v29M12 17h7m-7 7h7m10-7h7m-7 7h7" {...common} />
    </>}
  </Svg>;
}

export function CourseCard({ course, session, onPress, layout = 'list', last = false }: { course: Course; session: ProviderSession; onPress: () => void; layout?: 'list' | 'grid'; last?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const theme = useTheme();
  useEffect(() => {
    if (layout !== 'grid') return;
    let active = true;
    setImageFailed(false); setImageUri(null);
    if (course.imageUrl) void cachedCourseCover(session, course.imageUrl).then(uri => { if (active) setImageUri(uri); }).catch(() => { if (active) setImageFailed(true); });
    return () => { active = false; };
  }, [course.imageUrl, session.userId, layout]);
  if (layout === 'grid') return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`}
    style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.65 : 1 })}>
    <YStack flex={1} minHeight={202} backgroundColor="$panel" borderRadius={20} overflow="hidden" shadowColor="#000000" shadowOpacity={0.045} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
      {imageUri && !imageFailed
        ? <Image source={{ uri: imageUri }} resizeMode="cover" style={{ width: '100%', height: 118, backgroundColor: theme.soft.val }} onError={() => setImageFailed(true)} />
        : <YStack width="100%" height={118} backgroundColor="$soft" alignItems="center" justifyContent="center"><CourseIcon name={course.name} color={theme.muted.val} surface={theme.soft.val} /></YStack>}
      <YStack paddingHorizontal={14} paddingTop={12} paddingBottom={15} gap={5}>
        <Text fontSize={15} lineHeight={21} fontWeight="600" color="$color" numberOfLines={2}>{course.name}</Text>
        {!!course.teacher && <Text fontSize={12} color="$muted" numberOfLines={1}>{course.teacher}</Text>}
      </YStack>
    </YStack>
  </Pressable>;
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`查看 ${course.name} 的签到活动`} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}>
    <XStack minHeight={100} alignItems="center" marginHorizontal={18} paddingHorizontal={7} borderBottomWidth={last ? 0 : 1} borderColor="$separator" gap={19}>
      <CourseIcon name={course.name} color={theme.muted.val} surface={theme.panel.val} />
      <YStack flex={1} gap={4} paddingVertical={17}>
        <Text fontSize={18} lineHeight={25} fontWeight="500" color="$color" numberOfLines={2}>{course.name}</Text>
        {!!course.teacher && <Text fontSize={12} lineHeight={18} color="$muted" numberOfLines={1}>{course.teacher}</Text>}
      </YStack>
      <Text color="$muted" fontSize={27} fontWeight="300">›</Text>
    </XStack>
  </Pressable>;
}
