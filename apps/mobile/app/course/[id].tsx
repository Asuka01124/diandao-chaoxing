import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, YStack, useTheme } from 'tamagui';
import type { Activity } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { activityPhase } from '../../src/features/courses/activity-phase';
import { attendanceRow, courseAttendanceGroups } from '../../src/features/courses/attendance-list';
import { isDemoCourse } from '../../src/features/courses/demo-course';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, FeedbackNotice, GroupedList, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function CourseActivitiesScreen() {
  const { id, classId, accountId, name } = useLocalSearchParams<{ id: string; classId: string; accountId?: string; name?: string }>();
  const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? primaryAccount(data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notify = useFeedback();
  const theme = useTheme();
  useEffect(() => { if (store.ready && !primaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (account && id && classId) void refresh(); }, [account?.id, id, classId]);

  async function refresh(manual = false) {
    if (!account || !id || !classId || isDemoCourse(id)) return;
    setBusy(true); setError('');
    try {
      const session = await api.check(account.session);
      const activities = await api.activities(session, id, classId);
      await store.update(v => {
        const item = v.accounts.find(a => a.id === account.id);
        if (item) { item.session = session; item.state = 'VALID'; item.verifiedAt = new Date().toISOString(); }
        v.activityCache = [...v.activityCache.filter(a => a.cacheAccountId !== account.id || a.courseId !== id || a.classId !== classId), ...activities.map(a => ({ ...a, cacheAccountId: account.id }))];
      });
      if (manual) notify(`已更新 ${activities.length} 个活动`, 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : '加载活动失败';
      if (manual) notify(message, 'error');
      else setError(message);
    }
    finally { setBusy(false); }
  }
  if (!data || !primaryAccount(data)) return null;
  if (isDemoCourse(id)) return <AppScreen title="课程已移除" backLabel="课程" onBack={() => router.back()}><EmptyState title="测试课程已移除" detail="请返回课程列表" /></AppScreen>;
  const groups = courseAttendanceGroups(data.activityCache, account?.id ?? '', id, classId);
  const count = groups.unsigned.length + groups.signed.length + groups.unknown.length;
  const rows = (items: Activity[], emptyTitle: string) => <GroupedList>{items.length ? items.map((a, index) => {
    const ongoing = a.signed === false && activityPhase(a) !== 'ended';
    return <SettingsRow key={a.id} title={a.title} last={index === items.length - 1}
      {...attendanceRow(a)}
      accessory={ongoing ? <YStack backgroundColor="$actionSurface" paddingHorizontal={12} paddingVertical={6} borderRadius={999}><Text color="$actionText" fontSize={12} fontWeight="500">签到 ›</Text></YStack> : undefined}
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: a.id, accountId: account?.id } })} />;
  }) : <EmptyState title={busy ? '正在加载…' : emptyTitle} />}</GroupedList>;
  return <AppScreen title={name || '课程签到'} backLabel="课程" onBack={() => router.back()} headerAction={<Pressable accessibilityRole="button" accessibilityLabel={busy ? '正在刷新签到活动' : '刷新签到活动'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void refresh(true); }}
    style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, opacity: busy ? 0.65 : pressed ? 0.6 : 1, shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 })}>
    {busy ? <ActivityIndicator size="small" color={theme.brand.val} /> : <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M20 11a8 8 0 1 1-2.5-5.8M20 4v6h-6" stroke={theme.muted.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
  </Pressable>}>
    {!!error && <FeedbackNotice message={error} tone="error" />}
    {(!error || count > 0) && <>
      <SectionTitle meta={groups.unsigned.length ? String(groups.unsigned.length).padStart(2, '0') : undefined}>未签到</SectionTitle>{rows(groups.unsigned, '暂无未签到活动')}
      <SectionTitle meta={groups.signed.length ? String(groups.signed.length).padStart(2, '0') : undefined}>已签到</SectionTitle>{rows(groups.signed, '暂无已签到活动')}
      {!!groups.unknown.length && <><SectionTitle>待确认</SectionTitle>{rows(groups.unknown, '')}</>}
    </>}
  </AppScreen>;
}
