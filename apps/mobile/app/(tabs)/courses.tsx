import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Pressable } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import type { Account, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { CourseCard } from '../../src/features/courses/course-card';
import { courseKey, ongoingCourseActivities } from '../../src/features/courses/course-priority';
import { OngoingAttendanceCard } from '../../src/features/courses/ongoing-attendance-card';
import { useVault } from '../../src/state';
import { AppScreen, FeedbackNotice, GroupedList, SectionTitle, type FeedbackTone } from '../../src/ui';

type CourseLayout = 'list' | 'grid';

function LayoutIcon({ layout, color }: { layout: CourseLayout; color: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {layout === 'list' ? <>
      <Rect x={3} y={4} width={3.5} height={3.5} rx={1} fill={color} />
      <Rect x={3} y={10.2} width={3.5} height={3.5} rx={1} fill={color} />
      <Rect x={3} y={16.5} width={3.5} height={3.5} rx={1} fill={color} />
      <Path d="M10 5.8h11M10 12h11M10 18.2h11" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </> : <>
      <Rect x={3} y={3} width={7.5} height={7.5} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={13.5} y={3} width={7.5} height={7.5} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={3} y={13.5} width={7.5} height={7.5} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={13.5} y={13.5} width={7.5} height={7.5} rx={1.5} stroke={color} strokeWidth={1.8} />
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
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const updateTime = () => setNow(Date.now());
    const timer = setInterval(updateTime, 30_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') updateTime(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);

  useEffect(() => { if (store.ready && !primaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (account) void loadCourses(account); }, [account?.id]);

  async function loadCourses(current: Account, manual = false) {
    const request = ++sequence.current;
    setBusy(true); setStatus({ tone: 'loading', message: manual ? '正在刷新…' : '正在加载…' });
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
        setStatus({ tone: 'loading', message: `检查签到 · 0/${pending.length}` });
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
            if (request === sequence.current) setStatus({ tone: 'loading', message: `检查签到 · ${completed}/${pending.length}` });
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
      setNow(Date.now());
      setStatus(failures ? { tone: 'info', message: `${failures} 门课未同步，请重试` } : null);
    } catch (e) { if (request === sequence.current) setStatus({ tone: 'error', message: e instanceof Error ? e.message : '加载失败，请重试' }); }
    finally { if (request === sequence.current) setBusy(false); }
  }

  if (!data || !account) return null;
  const visibleCourses = courses;
  const ongoing = ongoingCourseActivities(courses, data.activityCache, account.id, now);
  const openCourse = (course: Course) => router.push({ pathname: '/course/[id]', params: { id: course.id, classId: course.classId, accountId: account.id, name: course.name } });
  const courseCards = layout === 'list'
    ? <GroupedList>{visibleCourses.map((course, index) => <CourseCard key={`${course.id}-${course.classId}`} course={course} index={index} session={account.session} last={index === visibleCourses.length - 1} onPress={() => openCourse(course)} />)}</GroupedList>
    : <YStack gap={12}>{Array.from({ length: Math.ceil(visibleCourses.length / 2) }, (_, rowIndex) => {
      const pair = visibleCourses.slice(rowIndex * 2, rowIndex * 2 + 2);
      return <XStack key={pair[0].id + '-' + pair[0].classId} gap={12}>
        {pair.map((course, colIndex) => <YStack key={`${course.id}-${course.classId}`} flex={1}><CourseCard course={course} index={rowIndex * 2 + colIndex} session={account.session} layout="grid" onPress={() => openCourse(course)} /></YStack>)}
        {pair.length === 1 && <YStack flex={1} />}
      </XStack>;
    })}</YStack>;

  const headerControls = <XStack alignItems="center" gap={8}>
    <XStack backgroundColor="$panel" borderRadius={14} padding={4} gap={2} shadowColor="#000000" shadowOpacity={0.04} shadowRadius={12} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
      {(['list', 'grid'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityLabel={option === 'list' ? '列表显示课程' : '网格显示课程'} accessibilityState={{ selected: layout === option }}
        onPress={() => setLayout(option)} style={({ pressed }) => ({ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: layout === option ? theme.soft.val : 'transparent', opacity: pressed ? 0.6 : 1 })}>
        <LayoutIcon layout={option} color={layout === option ? theme.color.val : theme.muted.val} />
      </Pressable>)}
    </XStack>
    <Pressable accessibilityRole="button" accessibilityLabel={busy ? '正在刷新课程' : '刷新课程'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void loadCourses(account, true); }}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, opacity: busy ? 0.65 : pressed ? 0.6 : 1, shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 })}>
      {busy ? <ActivityIndicator size="small" color={theme.brand.val} /> : <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M20 11a8 8 0 1 1-2.5-5.8M20 4v6h-6" stroke={theme.muted.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
    </Pressable>
  </XStack>;

  return <AppScreen title="我的课程" headerAction={headerControls}>
    {status && <YStack marginBottom={14}><FeedbackNotice message={status.message} tone={status.tone} /></YStack>}
    <OngoingAttendanceCard entries={ongoing}
      onPress={activity => router.push({ pathname: '/activity/[id]', params: { id: activity.id, accountId: account.id } })}
      onQuickSign={activity => router.push({ pathname: '/prepare/[id]', params: { id: activity.id, accountId: account.id } })} />
    <SectionTitle meta={String(courses.length).padStart(2, '0')}>全部课程</SectionTitle>
    {courseCards}
  </AppScreen>;
}
