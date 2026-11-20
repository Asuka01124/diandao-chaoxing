import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, useTheme } from 'tamagui';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { jobResult } from '../../src/core/job-result';
import { AppScreen, EmptyState, GroupedList, SettingsRow } from '../../src/ui';

export default function JobsScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<'全部' | '已签到' | '待处理'>('全部');
  const { data } = useVault();
  if (!data || !hasPrimaryAccount(data)) return null;
  const results = data.jobs.map(job => ({ job, result: jobResult(job, data.attempts.filter(a => a.jobId === job.id)) }));
  const visible = results.filter(({ result }) => filter === '全部' || (filter === '已签到' ? result.success : result.needsAttention)).reverse();

  return <AppScreen title="签到记录">
    <XStack gap={8} flexWrap="wrap" marginBottom={16}>
      {(['全部', '已签到', '待处理'] as const).map(label => {
        const active = filter === label;
        return <Pressable key={label} onPress={() => setFilter(label)} accessibilityRole="button" accessibilityState={{ selected: active }}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.65 : 1 })}>
          <Text paddingHorizontal={14} paddingVertical={6} borderRadius={20} backgroundColor={active ? '$actionSurface' : '$soft'}
            style={{ color: active ? theme.actionText.val : theme.color.val }} fontSize={14}>{label}</Text>
        </Pressable>;
      })}
    </XStack>
    <GroupedList>{visible.length ? visible.map(({ job, result }) => (
      <SettingsRow key={job.id} title={job.activity.title} detail={new Date(job.createdAt).toLocaleString()} value={result.label}
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />
    )) : <EmptyState title={filter === '全部' ? '还没有签到记录' : filter === '待处理' ? '没有待处理的记录' : '还没有已签到的记录'} />}</GroupedList>
  </AppScreen>;
}
