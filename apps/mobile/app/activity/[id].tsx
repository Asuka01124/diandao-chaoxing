import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { api } from '../../src/core/api';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { activityPhase } from '../../src/features/courses/activity-phase';
import { isDemoActivity } from '../../src/features/courses/demo-course';
import { AppScreen, EmptyState, FeedbackNotice, GroupedList, PrimaryButton, SectionTitle, SettingsRow, type FeedbackTone } from '../../src/ui';

export default function ActivityScreen() {
  const { id, accountId } = useLocalSearchParams<{ id: string; accountId?: string }>(); const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? data?.accounts[0];
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === account?.id);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: FeedbackTone } | null>(null);
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !activity) return null;
  async function openSignOut() {
    if (!account || !activity?.relation?.signOutId) return; setBusy(true); setStatus({ tone: 'loading', message: '正在打开签退…' });
    try {
      const related = await api.detail(account.session, { ...activity, id: activity.relation.signOutId, title: `${activity.title} · 签退`, phase: 'sign-out', relation: undefined, signed: null });
      await store.update(v => { v.activityCache = [...v.activityCache.filter(a => a.id !== related.id || a.cacheAccountId !== account.id), { ...related, cacheAccountId: account.id }]; });
      router.push({ pathname: '/activity/[id]', params: { id: related.id, accountId: account.id } });
    } catch (e) { const message = e instanceof Error ? e.message : '加载签退失败'; setStatus({ tone: 'error', message }); } finally { setBusy(false); }
  }
  const ended = activityPhase(activity) === 'ended';
  const requirement = activity.requirements ? [activity.requirements.captcha && '验证码', activity.requirements.face && '人脸', activity.requirements.location && '位置', activity.requirements.photo && '照片'].filter(Boolean).join('、') : '';
  if (isDemoActivity(activity)) return <AppScreen title="活动已移除" backLabel="返回" onBack={() => router.back()}><EmptyState title="请从课程列表打开当前签到活动" /></AppScreen>;
  const badgeColor = ended ? '$muted' : '$success';
  return <AppScreen title={activity.title}
    backLabel="返回" onBack={() => router.back()}
    headerAction={<Text color={badgeColor} fontSize={14} fontWeight="500">{ended ? '已结束' : '进行中'}</Text>}
    footer={!ended && activity.kind !== 'unknown' && activity.signed !== true ? <PrimaryButton variant="dock" disabled={busy} onPress={() => router.push({ pathname: '/prepare/[id]', params: { id: activity.id, accountId: account?.id } })}>准备签到</PrimaryButton> : undefined}>
    {status && <YStack marginBottom={14}><FeedbackNotice message={status.message} tone={status.tone} /></YStack>}
    <SectionTitle>签到信息</SectionTitle><GroupedList>
      <SettingsRow title="我的状态" accessory={<Text color={activity.signed === true ? '$success' : '$color'} fontSize={14} fontWeight="500">{activity.signed === true ? '已签到' : activity.signed === false ? '未签到' : '待确认'}</Text>} last={!activity.endTime && !requirement && !activity.relation?.signOutId} />
      {!!activity.endTime && <SettingsRow title="截止时间" detail={new Date(activity.endTime).toLocaleString()} last={!requirement && !activity.relation?.signOutId} />}
      {!!requirement && <SettingsRow title="签到要求" detail={requirement} last={!activity.relation?.signOutId} />}
      {activity.relation?.signOutId && <SettingsRow title="关联签退" detail={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? '尚未开始' : undefined} last onPress={activity.relation.signOutPublishTime && activity.relation.signOutPublishTime > Date.now() ? undefined : () => { void openSignOut(); }} />}
    </GroupedList>
  </AppScreen>;
}
