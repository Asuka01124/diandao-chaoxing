import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Account, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { CourseCard } from '../../src/features/courses/course-card';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, SectionTitle } from '../../src/ui';

type CourseLayout = 'list' | 'grid';

function LayoutIcon({ layout, color }: { layout: CourseLayout; color: string }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {layout === 'list' ? <>
      <Rect x={3} y={4} width={4} height={4} rx={1} fill={color} />
      <Rect x={3} y={10} width={4} height={4} rx={1} fill={color} />
      <Rect x={3} y={16} width={4} height={4} rx={1} fill={color} />
      <Path d="M10 6h11M10 12h11M10 18h11" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </> : <>
      <Rect x={3} y={3} width={8} height={8} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={13} y={3} width={8} height={8} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={3} y={13} width={8} height={8} rx={1.5} stroke={color} strokeWidth={2} />
      <Rect x={13} y={13} width={8} height={8} rx={1.5} stroke={color} strokeWidth={2} />
    </>}
  </Svg>;
}

export default function CoursesScreen() {
  const store = useVault(); const data = store.data;
  const [courses, setCourses] = useState<Course[]>([]);
  const [layout, setLayout] = useState<CourseLayout>('list');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const sequence = useRef(0);
  const account = primaryAccount(data);
  const theme = useTheme();

  useEffect(() => { if (store.ready && !primaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (account) void loadCourses(account); }, [account?.id]);

  async function loadCourses(current: Account) {
    const request = ++sequence.current;
    setBusy(true); setError('');
    try {
      const session = await api.check(current.session);
      await store.update(v => { const item = v.accounts.find(a => a.id === current.id); if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); } });
      const list = await api.courses(session);
      if (request === sequence.current) setCourses(list);
    } catch (e) { if (request === sequence.current) setError(e instanceof Error ? e.message : '课程读取失败'); }
    finally { if (request === sequence.current) setBusy(false); }
  }

  if (!data || !account) return null;
  const openCourse = (course: Course) => router.push({ pathname: '/course/[id]', params: { id: course.id, classId: course.classId, accountId: account.id, name: course.name } });
  const courseCards = layout === 'list'
    ? <GroupedList>{courses.map(course => <CourseCard key={`${course.id}-${course.classId}`} course={course} session={account.session} onPress={() => openCourse(course)} />)}</GroupedList>
    : <YStack gap={12}>{Array.from({ length: Math.ceil(courses.length / 2) }, (_, index) => {
      const pair = courses.slice(index * 2, index * 2 + 2);
      return <XStack key={pair[0].id + '-' + pair[0].classId} gap={12}>
        {pair.map(course => <YStack key={`${course.id}-${course.classId}`} flex={1}><CourseCard course={course} session={account.session} layout="grid" onPress={() => openCourse(course)} /></YStack>)}
        {pair.length === 1 && <YStack flex={1} />}
      </XStack>;
    })}</YStack>;
  return <AppScreen title="课程" subtitle="选择课程，查看签到">
    <XStack alignItems="center" justifyContent="space-between">
      <XStack backgroundColor="$soft" borderRadius={14} padding={3} gap={8}>
        {(['list', 'grid'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={option === 'list' ? '列表显示课程' : '网格显示课程'} accessibilityState={{ selected: layout === option }}
          onPress={() => setLayout(option)} style={{ width: 46, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: layout === option ? theme.panel.val : 'transparent' }}>
          <LayoutIcon layout={option} color={layout === option ? theme.brand.val : theme.muted.val} />
        </Pressable>)}
      </XStack>
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? '正在刷新课程' : '刷新课程'} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { void loadCourses(account); }}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, borderWidth: 1, borderColor: theme.separator.val, opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator size="small" color={theme.brand.val} /> : <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M20 11a8 8 0 1 1-2.5-5.8M20 4v6h-6" stroke={theme.brand.val} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
      </Pressable>
    </XStack>
    <SectionTitle>我的课程</SectionTitle>
    {courses.length ? courseCards : <GroupedList><EmptyState title={busy ? '正在读取课程' : '暂无课程'} detail={busy ? '请稍候' : '点击上方刷新按钮重试'} /></GroupedList>}
    {!!error && <Text color="$danger" marginTop={14}>{error}</Text>}
  </AppScreen>;
}
