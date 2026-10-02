import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Account, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { CourseCard } from '../../src/features/courses/course-card';
import { courseKey, ongoingCourseKeys, prioritizeOngoingCourses } from '../../src/features/courses/course-priority';
import { useVault } from '../../src/state';
import { AppScreen, FeedbackNotice, GroupedList, type FeedbackTone } from '../../src/ui';

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone } | null>(null);
  const sequence = useRef(0);
  const checkedAt = useRef<Record<string, number>>({});
  const account = primaryAccount(data);
  const theme = useTheme();

  useEffect(() => { if (store.ready && !primaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (account) void loadCourses(account); }, [account?.id]);

  async function loadCourses(current: Account, manual = false) {
    const request = ++sequence.current;
    setBusy(true); setStatus({ tone: 'loading', message: manual ? '正在同步最新课程…' : '正在读取课程…' });
    try {
      const session = await api.check(current.session);
      await store.update(v => { const item = v.accounts.find(a => a.id === current.id); if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); } });
      const list = await api.courses(session);
      if (request !== sequence.current) return;
      setCourses(list);
      const now = Date.now();
      const cachedAt = new Map<string, number>();
      for (const activity of store.get().activityCache) if (activity.cacheAccountId === current.id && activity.cachedAt != null) {
        const key = courseKey({ id: activity.courseId, classId: activity.classId });
        cachedAt.set(key, Math.max(cachedAt.get(key) ?? 0, activity.cachedAt));
      }
      const pending = list.filter(course => {
        const key = courseKey(course);
        const lastChecked = Math.max(checkedAt.current[`${current.id}:${key}`] ?? 0, cachedAt.get(key) ?? 0);
        return manual || now - lastChecked >= 5 * 60_000;
      });
      const scanned: { course: Course; activities: Awaited<ReturnType<typeof api.activities>> }[] = [];
      let next = 0; let completed = 0; let failures = 0;
      if (pending.length) {
        setStatus({ tone: 'loading', message: `正在检查签到活动 · 0/${pending.length} 门课程` });
        await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
          while (request === sequence.current) {
            const course = pending[next++];
            if (!course) return;
            try {
              const activities = await api.activities(session, course.id, course.classId);
              if (request !== sequence.current) return;
              scanned.push({ course, activities });
              checkedAt.current[`${current.id}:${courseKey(course)}`] = Date.now();
            } catch { failures++; }
            completed++;
            if (request === sequence.current) setStatus({ tone: 'loading', message: `正在检查签到活动 · ${completed}/${pending.length} 门课程` });
          }
        }));
        if (request !== sequence.current) return;
        if (scanned.length) await store.update(v => {
          const scannedKeys = new Set(scanned.map(item => courseKey(item.course)));
          const previous = new Map(v.activityCache.filter(activity => activity.cacheAccountId === current.id)
            .map(activity => [`${activity.courseId}:${activity.classId}:${activity.id}`, activity] as const));
          v.activityCache = [
            ...v.activityCache.filter(activity => activity.cacheAccountId !== current.id || !scannedKeys.has(courseKey({ id: activity.courseId, classId: activity.classId }))),
            ...scanned.flatMap(item => item.activities.map(activity => {
              const older = previous.get(`${activity.courseId}:${activity.classId}:${activity.id}`);
              if (older && (older.cachedAt ?? 0) > (activity.cachedAt ?? 0)) return older;
              return { ...older, ...activity, kind: older?.requirements ? older.kind : activity.kind, cacheAccountId: current.id };
            })),
          ];
        });
      }
      if (request !== sequence.current) return;
      const activeKeys = ongoingCourseKeys(store.get().activityCache, current.id);
      const activeCount = list.filter(course => activeKeys.has(courseKey(course))).length;
      setStatus({ tone: failures ? 'info' : 'success', message: `${list.length} 门课程 · ${activeCount} 门有进行中的签到${failures ? ` · ${failures} 门未能检查` : ''}` });
    } catch (e) { if (request === sequence.current) setStatus({ tone: 'error', message: `课程读取失败：${e instanceof Error ? e.message : '请稍后重试'}` }); }
    finally { if (request === sequence.current) setBusy(false); }
  }

  if (!data || !account) return null;
  const visibleCourses = prioritizeOngoingCourses(courses, data.activityCache, account.id);
  const openCourse = (course: Course) => router.push({ pathname: '/course/[id]', params: { id: course.id, classId: course.classId, accountId: account.id, name: course.name } });
  const courseCards = layout === 'list'
    ? <GroupedList><Text color="$muted" fontSize={14} marginLeft={18} marginTop={16} marginBottom={9}>我的课程</Text>{visibleCourses.map((course, index) => <CourseCard key={`${course.id}-${course.classId}`} course={course} session={account.session} last={index === visibleCourses.length - 1} onPress={() => openCourse(course)} />)}</GroupedList>
    : <YStack gap={12}>{Array.from({ length: Math.ceil(visibleCourses.length / 2) }, (_, index) => {
      const pair = visibleCourses.slice(index * 2, index * 2 + 2);
      return <XStack key={pair[0].id + '-' + pair[0].classId} gap={12}>
        {pair.map(course => <YStack key={`${course.id}-${course.classId}`} flex={1}><CourseCard course={course} session={account.session} layout="grid" onPress={() => openCourse(course)} /></YStack>)}
        {pair.length === 1 && <YStack flex={1} />}
      </XStack>;
    })}</YStack>;
  return <AppScreen title="我的课程" subtitle="选择一门课程，继续查看签到活动">
    <XStack alignItems="center" justifyContent="space-between">
      <XStack backgroundColor="$panel" borderRadius={18} padding={5} gap={5} shadowColor="#000000" shadowOpacity={0.05} shadowRadius={13} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
        {(['list', 'grid'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={option === 'list' ? '列表显示课程' : '网格显示课程'} accessibilityState={{ selected: layout === option }}
          onPress={() => setLayout(option)} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: layout === option ? theme.soft.val : 'transparent', opacity: pressed ? 0.6 : 1 })}>
          <LayoutIcon layout={option} color={layout === option ? theme.color.val : theme.muted.val} />
        </Pressable>)}
      </XStack>
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? '正在刷新课程' : '刷新课程'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void loadCourses(account, true); }}
        style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, opacity: busy ? 0.65 : pressed ? 0.6 : 1, shadowColor: '#000000', shadowOpacity: 0.05, shadowRadius: 13, shadowOffset: { width: 0, height: 4 }, elevation: 2 })}>
        {busy ? <ActivityIndicator size="small" color={theme.brand.val} /> : <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M20 11a8 8 0 1 1-2.5-5.8M20 4v6h-6" stroke={theme.muted.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
      </Pressable>
    </XStack>
    {status && <YStack marginTop={13}><FeedbackNotice message={status.message} tone={status.tone} /></YStack>}
    <YStack marginTop={13}>{courseCards}</YStack>
  </AppScreen>;
}
