import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { Account, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { CourseCard } from '../../src/features/courses/course-card';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function CoursesScreen() {
  const store = useVault(); const data = store.data;
  const [accountId, setAccountId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const sequence = useRef(0);
  const activeId = accountId ?? primaryAccount(data)?.id ?? '';
  const account = data?.accounts.find(a => a.id === activeId);

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

  if (!data || !primaryAccount(data)) return null;
  return <AppScreen title="课程" subtitle="点击课程查看正在进行和已结束的签到">
    <HeroCard eyebrow="我的课程" title={account ? `你好，${account.label}` : '课程列表'} detail="选择课程后可查看签到活动，再选择需要代签的账号。" />
    <SectionTitle>浏览课程的账号</SectionTitle>
    <GroupedList>{data.accounts.map(item => <SettingsRow key={item.id} title={item.label}
      detail={item.role === 'primary' ? '我的主账号' : '代签账号'} symbol={item.role === 'primary' ? '主' : '代'}
      selected={item.id === activeId} onPress={() => { sequence.current++; setAccountId(item.id); setCourses([]); setError(''); }} />)}</GroupedList>
    <YStack marginTop={18}><PrimaryButton disabled={busy || !account} onPress={() => { if (account) void loadCourses(account); }}>{busy ? '正在读取课程…' : '刷新课程'}</PrimaryButton></YStack>
    <SectionTitle>课程列表</SectionTitle>
    <GroupedList>{courses.length ? courses.map(course => <CourseCard key={`${course.id}-${course.classId}`} course={course}
      onPress={() => router.push({ pathname: '/course/[id]', params: { id: course.id, classId: course.classId, accountId: activeId, name: course.name, imageUrl: course.imageUrl ?? '' } })} />)
      : <EmptyState title={busy ? '正在读取课程' : '暂无课程'} detail={busy ? '请稍候' : '点击“刷新课程”重试'} />}</GroupedList>
    {!!error && <Text color="$danger" marginTop={14}>{error}</Text>}
  </AppScreen>;
}
