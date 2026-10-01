import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { Activity } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { activityPhase } from '../../src/features/courses/activity-phase';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function CourseActivitiesScreen() {
  const { id, classId, accountId, name } = useLocalSearchParams<{ id: string; classId: string; accountId?: string; name?: string }>();
  const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? primaryAccount(data);
  const [list, setList] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (store.ready && !primaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (account && id && classId) void refresh(); }, [account?.id, id, classId]);

  async function refresh() {
    if (!account || !id || !classId) return;
    setBusy(true); setError('');
    try {
      const session = await api.check(account.session);
      const activities = await api.activities(session, id, classId);
      await store.update(v => {
        const item = v.accounts.find(a => a.id === account.id);
        if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); }
        v.activityCache = [...v.activityCache.filter(a => a.cacheAccountId !== account.id || a.courseId !== id || a.classId !== classId), ...activities.map(a => ({ ...a, cacheAccountId: account.id }))];
      });
      setList(activities);
    } catch (e) { setError(e instanceof Error ? e.message : '签到活动读取失败'); }
    finally { setBusy(false); }
  }
  if (!data || !primaryAccount(data)) return null;
  const ongoing = list.filter(a => activityPhase(a) === 'ongoing');
  const ended = list.filter(a => activityPhase(a) === 'ended');
  const rows = (items: Activity[], emptyTitle: string) => <GroupedList>{items.length ? items.map(a => <SettingsRow key={a.id} title={a.title}
    detail={a.signed ? '我已签到' : a.startTime ? new Date(a.startTime).toLocaleString() : undefined}
    symbol="✓" onPress={() => router.push({ pathname: '/activity/[id]', params: { id: a.id, accountId: account?.id } })} />)
    : <EmptyState title={busy ? '正在读取…' : emptyTitle} />}</GroupedList>;
  return <AppScreen title={name || '课程签到'}>
    <SectionTitle>进行中</SectionTitle>{rows(ongoing, '暂无进行中的签到')}
    <SectionTitle>已结束</SectionTitle>{rows(ended, '暂无已结束的签到')}
    <YStack marginTop={18}><PrimaryButton disabled={busy} onPress={() => { void refresh(); }}>{busy ? '正在读取…' : '刷新签到活动'}</PrimaryButton></YStack>
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
