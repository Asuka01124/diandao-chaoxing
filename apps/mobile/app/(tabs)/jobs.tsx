import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { jobResult } from '../../src/core/job-result';
import { AppScreen, EmptyState, GroupedList, HeroCard, SectionTitle, SettingsRow } from '../../src/ui';

export default function JobsScreen() {
  const { data, ready } = useVault(); useEffect(() => { if (ready && !hasPrimaryAccount(data)) router.replace('/'); }, [ready, data?.accounts]); if (!data || !hasPrimaryAccount(data)) return null;
  const results = data.jobs.map(job => ({ job, result: jobResult(job, data.attempts.filter(a => a.jobId === job.id)) }));
  const completed = results.filter(item => item.result.success).length;
  const attention = results.filter(item => item.result.needsAttention).length;
  return <AppScreen title="签到任务" subtitle="查看签到进度和结果">
    <HeroCard eyebrow="任务概览" title={`共 ${data.jobs.length} 个任务`} detail="点开任务，查看每个账号的结果。" />
    <XStack gap={11} marginTop={14}>
      {([{ label: '已签到', value: completed }, { label: '待处理', value: attention }] as const).map(item =>
        <YStack key={item.label} flex={1} backgroundColor="$panel" borderRadius={20} padding={17} gap={4}>
          <Text color="$brand" fontSize={24} fontWeight="700">{item.value}</Text>
          <Text color="$muted" fontSize={12} fontWeight="600">{item.label}</Text>
        </YStack>)}
    </XStack>
    <SectionTitle>最近任务</SectionTitle><GroupedList>{results.length ? [...results].reverse().map(({ job, result }) => <SettingsRow key={job.id} title={job.activity.title} detail={`${new Date(job.createdAt).toLocaleString()} · ${result.label}`} symbol={result.success ? '✓' : result.needsAttention ? '!' : '…'} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />) : <EmptyState title="还没有任务" detail="从课程页选择活动并签到，结果会显示在这里" />}</GroupedList>
  </AppScreen>;
}
