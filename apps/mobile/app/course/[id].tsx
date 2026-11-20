import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from 'tamagui';
import type { Activity } from '@sign/shared';
import { api } from '../../src/core/api';
import { primaryAccount } from '../../src/features/accounts/account-role';
import { attendanceRow, courseAttendanceGroups } from '../../src/features/courses/attendance-list';
import { isDemoCourse } from '../../src/features/courses/demo-course';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, FeedbackNotice, GroupedList, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function CourseActivitiesScreen() {
  const { id, classId, accountId, name } = useLocalSearchParams<{ id: string; classId: string; accountId?: string; name?: string }>();
  const store = useVault(); const data = store.data;
  const account = data?.accounts.find(a => a.id === accountId) ?? primaryAccount(data);
  const [busy, setBusy] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string>();
  const loadKey = account && id && classId ? `${account.id}:${classId}:${id}` : undefined;
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
    finally { setLoadedKey(loadKey); setBusy(false); }
  }
  if (!data || !primaryAccount(data)) return null;
  if (isDemoCourse(id)) return <AppScreen title="课程已移除" backLabel="课程" onBack={() => router.back()}><EmptyState title="请返回课程列表" /></AppScreen>;
  const groups = courseAttendanceGroups(data.activityCache, account?.id ?? '', id, classId);
  const count = groups.unsigned.length + groups.signed.length + groups.unknown.length;
  const rows = (items: Activity[], label: string) => items.length > 0 && <>
    <SectionTitle>{label}</SectionTitle>
    <GroupedList>{items.map(a => <SettingsRow key={a.id} title={a.title} value={attendanceRow(a).detail}
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: a.id, accountId: account?.id } })} />)}</GroupedList>
  </>;
  return <AppScreen title={name || '课程签到'} backLabel="课程" onBack={() => router.back()} headerAction={<Pressable accessibilityRole="button" accessibilityLabel={busy ? '正在刷新签到活动' : '刷新签到活动'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => { void refresh(true); }}
    style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, opacity: pressed ? 0.6 : 1 })}>
    {busy ? <ActivityIndicator size="small" color={theme.brand.val} /> : <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d="M20 11a8 8 0 1 1-2.5-5.8M20 4v6h-6" stroke={theme.muted.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
  </Pressable>}>
    {!!error && <FeedbackNotice message={error} tone="error" />}
    {rows(groups.unsigned, '未签到')}
    {rows(groups.signed, '已签到')}
    {rows(groups.unknown, '待确认')}
    {!count && !error && <EmptyState title={busy || (loadKey && loadKey !== loadedKey) ? '正在加载…' : '暂无签到活动'} />}
  </AppScreen>;
}
