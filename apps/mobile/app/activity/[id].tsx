import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { api } from '../../src/core/api';
import { useVault } from '../../src/state';
import { AppScreen, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function ActivityScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>(); const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? data?.accounts[0];
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === account?.id);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!data) router.replace('/'); }, [!!data]);
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
  return <AppScreen title={activity.title} subtitle={account ? `使用 ${account.label} 查看活动` : '活动详情'} footer={<PrimaryButton onPress={() => router.push({ pathname: '/prepare/[id]', params: { id: activity.id, accountId: account?.id } })} disabled={activity.kind === 'unknown'}>准备签到</PrimaryButton>}>
    <HeroCard eyebrow="签到活动" title={activity.signed === null ? '等待状态确认' : activity.signed ? '你已完成签到' : '可以准备签到'} detail="提交前会再次核查账号、活动和远端签到状态。" />
    <SectionTitle>活动详情</SectionTitle><GroupedList>
      <SettingsRow title="类型" detail={activity.kind} /><SettingsRow title="开始" detail={activity.startTime ? new Date(activity.startTime).toLocaleString() : '未知'} />
      <SettingsRow title="结束" detail={activity.endTime ? new Date(activity.endTime).toLocaleString() : '未知'} /><SettingsRow title="状态" detail={activity.signed === null ? '待查询' : activity.signed ? '已签到' : '未签到'} />
      <SettingsRow title="验证要求" detail={activity.requirements ? [activity.requirements.captcha && '验证码', activity.requirements.face && '人脸', activity.requirements.location && '位置', activity.requirements.photo && '照片'].filter(Boolean).join('、') || '无' : '待查询'} />
      {activity.relation?.signInId && <SettingsRow title="关联签到 ID" detail={activity.relation.signInId} />}
      {activity.relation?.signOutId && <SettingsRow title="关联签退" detail={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? '尚未发布' : '已发布，点击查看'} onPress={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? undefined : () => { void openSignOut(); }} />}
    </GroupedList>
    <YStack marginTop={16}><PrimaryButton onPress={() => { void refresh(); }} disabled={busy || !account}>{busy ? '读取中…' : '刷新详情'}</PrimaryButton></YStack>
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
