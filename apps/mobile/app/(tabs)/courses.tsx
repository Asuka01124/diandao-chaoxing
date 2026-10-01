import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { Account, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { CourseCard } from '../../src/features/courses/course-card';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, PrimaryButton, SectionTitle } from '../../src/ui';

export default function CoursesScreen() {
  const store = useVault(); const data = store.data;
  const [courses, setCourses] = useState<Course[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const sequence = useRef(0);
  const account = primaryAccount(data);

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
  return <AppScreen title="课程" subtitle="选择课程，查看签到">
    <SectionTitle>我的课程</SectionTitle>
    <GroupedList>{courses.length ? courses.map(course => <CourseCard key={`${course.id}-${course.classId}`} course={course} session={account.session}
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id, classId: course.classId, accountId: account.id, name: course.name } })} />)
      : <EmptyState title={busy ? '正在读取课程' : '暂无课程'} detail={busy ? '请稍候' : '点击下方按钮重试'} />}</GroupedList>
    <YStack marginTop={16}><PrimaryButton disabled={busy} onPress={() => { void loadCourses(account); }}>{busy ? '正在刷新…' : '刷新课程'}</PrimaryButton></YStack>
    {!!error && <Text color="$danger" marginTop={14}>{error}</Text>}
  </AppScreen>;
}
