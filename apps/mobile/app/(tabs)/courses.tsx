import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { ChatGroup, Course } from '@sign/shared';
import { api } from '../../src/core/api';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function CoursesScreen() {
  const store = useVault(); const data = store.data;
  const [accountId, setAccountId] = useState<string | null>(null); const [courses, setCourses] = useState<Course[]>([]); const [selected, setSelected] = useState<Course | null>(null);
  const [source, setSource] = useState<'course' | 'group'>('course'); const [groups, setGroups] = useState<ChatGroup[]>([]); const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!data) router.replace('/'); }, [!!data]);
  if (!data) return null;
  const activeId = accountId ?? data.accounts[0]?.id; const account = data.accounts.find(a => a.id === activeId);
  async function currentSession() {
    if (!account) throw new Error('请选择账号');
    const session = await api.check(account.session);
    await store.update(v => { const item = v.accounts.find(a => a.id === account.id); if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); } });
    return session;
  }
  async function loadCourses() { if (!account) return; setBusy(true); setError(''); try { setCourses(await api.courses(await currentSession())); setSelected(null); } catch (e) { setError(e instanceof Error ? e.message : '课程读取失败'); } finally { setBusy(false); } }
  async function loadActivities() {
    if (!account || !selected) return; setBusy(true); setError('');
    try {
      const activities = await api.activities(await currentSession(), selected.id, selected.classId);
      await store.update(v => { v.activityCache = [...v.activityCache.filter(a => a.cacheAccountId !== account.id || a.source !== 'course' || a.courseId !== selected.id || a.classId !== selected.classId), ...activities.map(a => ({ ...a, cacheAccountId: account.id }))]; });
    } catch (e) { setError(e instanceof Error ? e.message : '活动读取失败'); } finally { setBusy(false); }
  }
  async function loadGroups() { if (!account) return; setBusy(true); setError(''); try { setGroups(await api.groups(await currentSession())); setSelectedGroup(null); } catch (e) { setError(e instanceof Error ? e.message : '群聊读取失败'); } finally { setBusy(false); } }
  async function loadGroupActivities() {
    if (!selectedGroup) return; setBusy(true); setError('');
    try { const activities = await api.groupActivities(await currentSession(), selectedGroup.id); await store.update(v => { v.activityCache = [...v.activityCache.filter(a => a.cacheAccountId !== account?.id || a.source !== 'group' || a.groupId !== selectedGroup.id), ...activities.map(a => ({ ...a, cacheAccountId: account!.id }))]; }); }
    catch (e) { setError(e instanceof Error ? e.message : '群聊活动读取失败'); } finally { setBusy(false); }
  }
  const activities = selected ? data.activityCache.filter(a => a.cacheAccountId === activeId && a.source === 'course' && a.courseId === selected.id && a.classId === selected.classId && a.cachedAt && Date.now() - a.cachedAt < 5 * 60_000) : [];
  const chatActivities = selectedGroup ? data.activityCache.filter(a => a.cacheAccountId === activeId && a.source === 'group' && a.groupId === selectedGroup.id && a.cachedAt && Date.now() - a.cachedAt < 5 * 60_000) : [];
  return <AppScreen title="课程" subtitle="查看课程和群聊中的签到活动">
    <HeroCard eyebrow="活动发现" title={account ? `你好，${account.label}` : '先添加一个账号'} detail="选择账号和活动来源，读取最新的签到活动。进入活动后会再次核查状态。" />
    <SectionTitle>使用账号</SectionTitle><GroupedList>{data.accounts.length ? data.accounts.map(a => <SettingsRow key={a.id} title={a.label} detail={a.id === activeId ? '当前账号' : a.session.identifier} symbol={a.label.slice(0, 1)} selected={a.id === activeId} onPress={() => { setAccountId(a.id); setCourses([]); setSelected(null); setGroups([]); setSelectedGroup(null); }} />) : <EmptyState title="尚无可用账号" detail="请先到账号页添加已授权账号" />}</GroupedList>
    <SectionTitle>活动来源</SectionTitle><GroupedList><SettingsRow title="课程" symbol="▤" selected={source === 'course'} onPress={() => setSource('course')} /><SettingsRow title="群聊" symbol="●" selected={source === 'group'} onPress={() => setSource('group')} /></GroupedList>
    {source === 'course' ? <>
      <YStack marginTop={16}><PrimaryButton onPress={() => { void loadCourses(); }} disabled={!account || busy}>读取课程</PrimaryButton></YStack>
      <SectionTitle>课程列表</SectionTitle><GroupedList>{courses.length ? courses.map(course => <SettingsRow key={`${course.id}-${course.classId}`} title={course.name} detail={course.teacher} symbol="▤" selected={selected?.id === course.id && selected.classId === course.classId} onPress={() => setSelected(course)} />) : <EmptyState title="暂无课程" detail="点击“读取课程”获取当前账号的课程" />}</GroupedList>
      {selected && <><SectionTitle>{selected.name} · 签到活动</SectionTitle><YStack marginBottom={12}><PrimaryButton onPress={() => { void loadActivities(); }} disabled={busy}>刷新活动</PrimaryButton></YStack><GroupedList>{activities.map(activity => <SettingsRow key={activity.id} title={activity.title} detail={`${activity.kind} · ${activity.startTime ? new Date(activity.startTime).toLocaleString() : '时间未知'}`} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: activity.id, accountId: activeId } })} />)}</GroupedList></>}
    </> : <>
      <YStack marginTop={16}><PrimaryButton onPress={() => { void loadGroups(); }} disabled={!account || busy}>读取群聊</PrimaryButton></YStack>
      <SectionTitle>群聊列表</SectionTitle><GroupedList>{groups.length ? groups.map(group => <SettingsRow key={group.id} title={group.name} symbol="●" selected={selectedGroup?.id === group.id} onPress={() => setSelectedGroup(group)} />) : <EmptyState title="暂无群聊" detail="点击“读取群聊”获取当前账号的群聊" />}</GroupedList>
      {selectedGroup && <><SectionTitle>{selectedGroup.name} · 签到活动</SectionTitle><YStack marginBottom={12}><PrimaryButton onPress={() => { void loadGroupActivities(); }} disabled={busy}>刷新活动</PrimaryButton></YStack><GroupedList>{chatActivities.map(activity => <SettingsRow key={activity.id} title={activity.title} detail={activity.kind} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: activity.id, accountId: activeId } })} />)}</GroupedList></>}
    </>}
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
