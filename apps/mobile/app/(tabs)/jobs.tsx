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
  return <AppScreen title="签到任务" subtitle="查看每一次执行，以及每个账号的结果">
    <HeroCard eyebrow="任务概览" title={`${data.jobs.length} 个任务，进度一目了然`} detail="结果按账号独立记录；未完成的任务可以继续处理。" />
    <XStack gap={11} marginTop={14}>
      {([{ label: '已签到', value: completed }, { label: '待处理', value: attention }] as const).map(item =>
        <YStack key={item.label} flex={1} backgroundColor="$panel" borderRadius={20} padding={17} gap={4}>
          <Text color="$brand" fontSize={24} fontWeight="700">{item.value}</Text>
          <Text color="$muted" fontSize={12} fontWeight="600">{item.label}</Text>
        </YStack>)}
    </XStack>
    <SectionTitle>最近任务</SectionTitle><GroupedList>{results.length ? [...results].reverse().map(({ job, result }) => <SettingsRow key={job.id} title={job.activity.title} detail={`${new Date(job.createdAt).toLocaleString()} · ${result.label}`} symbol={result.success ? '✓' : result.needsAttention ? '!' : '…'} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />) : <EmptyState title="还没有任务" detail="在课程页选择签到活动，即可开始创建任务" />}</GroupedList>
  </AppScreen>;
}
