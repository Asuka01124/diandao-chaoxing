import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { AppScreen, EmptyState, GroupedList, HeroCard, SectionTitle, SettingsRow } from '../../src/ui';

export default function JobsScreen() {
  const { data, ready } = useVault(); useEffect(() => { if (ready && !hasPrimaryAccount(data)) router.replace('/'); }, [ready, data?.accounts]); if (!data || !hasPrimaryAccount(data)) return null;
  const completed = data.jobs.filter(job => job.state === 'DONE').length;
  const attention = data.jobs.filter(job => job.state === 'WAITING').length;
  return <AppScreen title="签到任务" subtitle="查看每一次执行，以及每个账号的结果">
    <HeroCard eyebrow="任务概览" title={`${data.jobs.length} 个任务，进度一目了然`} detail="结果按账号独立记录；未完成的任务可以继续处理。" />
    <XStack gap={11} marginTop={14}>
      {([{ label: '已完成', value: completed }, { label: '待处理', value: attention }] as const).map(item =>
        <YStack key={item.label} flex={1} backgroundColor="$panel" borderWidth={1} borderColor="$glassBorder" borderRadius={20} padding={17} gap={4}>
          <Text color="$brand" fontSize={24} fontWeight="700">{item.value}</Text>
          <Text color="$muted" fontSize={12} fontWeight="600">{item.label}</Text>
        </YStack>)}
    </XStack>
    <SectionTitle>最近任务</SectionTitle><GroupedList>{data.jobs.length ? [...data.jobs].reverse().map(job => <SettingsRow key={job.id} title={job.activity.title} detail={`${new Date(job.createdAt).toLocaleString()} · ${job.state === 'DONE' ? '已完成' : job.state === 'WAITING' ? '等待输入' : '执行中'}`} symbol={job.state === 'DONE' ? '✓' : '…'} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />) : <EmptyState title="还没有任务" detail="在课程页选择签到活动，即可开始创建任务" />}</GroupedList>
  </AppScreen>;
}
