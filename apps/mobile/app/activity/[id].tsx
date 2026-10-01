import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { api } from '../../src/core/api';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { activityPhase } from '../../src/features/courses/activity-phase';
import { AppScreen, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function ActivityScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>(); const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? data?.accounts[0];
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === account?.id);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (activity && account) void refresh(); }, [id, accountId]);
  if (!data || !activity) return null;
  async function refresh() {
    if (!account || !activity) return; setBusy(true); setError('');
    try {
      const session = await api.check(account.session);
      const detail = await api.detail(session, activity);
      let signed: boolean | null = null;
      try { const status = await api.status(session, detail); signed = status.state === 'SIGNED' ? true : status.state === 'READY' ? false : null; }
      catch { setError('活动详情已更新，但远端签到状态暂时无法确认'); }
      await store.update(v => { const item = v.accounts.find(a => a.id === account.id); if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); } const index = v.activityCache.findIndex(a => a.id === detail.id && a.cacheAccountId === account.id); if (index >= 0) v.activityCache[index] = { ...detail, cacheAccountId: account.id, signed }; });
    }
    catch (e) { setError(e instanceof Error ? e.message : '详情读取失败'); } finally { setBusy(false); }
  }
  async function openSignOut() {
    if (!account || !activity?.relation?.signOutId) return; setBusy(true); setError('');
    try {
      const related = await api.detail(account.session, { ...activity, id: activity.relation.signOutId, title: `${activity.title} · 签退`, phase: 'sign-out', relation: undefined, signed: null });
      await store.update(v => { v.activityCache = [...v.activityCache.filter(a => a.id !== related.id || a.cacheAccountId !== account.id), { ...related, cacheAccountId: account.id }]; });
      router.push({ pathname: '/activity/[id]', params: { id: related.id, accountId: account.id } });
    } catch (e) { setError(e instanceof Error ? e.message : '签退活动读取失败'); } finally { setBusy(false); }
  }
  const ended = activityPhase(activity) === 'ended';
  const requirement = activity.requirements ? [activity.requirements.captcha && '验证码', activity.requirements.face && '人脸', activity.requirements.location && '位置', activity.requirements.photo && '照片'].filter(Boolean).join('、') : '';
  return <AppScreen title={activity.title} subtitle={account?.label} footer={!ended && activity.kind !== 'unknown' ? <PrimaryButton onPress={() => router.push({ pathname: '/prepare/[id]', params: { id: activity.id, accountId: account?.id } })}>选择账号签到</PrimaryButton> : undefined}>
    <HeroCard eyebrow={ended ? '已结束' : '进行中'} title={activity.signed ? '你已签到' : ended ? '签到已结束' : '可以签到'} detail={ended ? undefined : '可选择账号，帮同学完成签到。'} />
    <SectionTitle>签到信息</SectionTitle><GroupedList>
      {!!activity.endTime && <SettingsRow title="截止时间" detail={new Date(activity.endTime).toLocaleString()} />}
      {!!requirement && <SettingsRow title="需要" detail={requirement} />}
      {activity.relation?.signOutId && <SettingsRow title="签退" detail={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? '尚未开始' : '点击查看'} onPress={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? undefined : () => { void openSignOut(); }} />}
    </GroupedList>
    <YStack marginTop={16}><PrimaryButton onPress={() => { void refresh(); }} disabled={busy || !account}>{busy ? '更新中…' : '更新状态'}</PrimaryButton></YStack>
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
