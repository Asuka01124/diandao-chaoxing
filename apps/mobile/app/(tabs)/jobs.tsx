import { useEffect } from 'react';
import { router } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { jobResult } from '../../src/core/job-result';
import { AppScreen, EmptyState, GroupedList, SectionTitle, SettingsRow } from '../../src/ui';

export default function JobsScreen() {
  const { data, ready } = useVault();
  useEffect(() => { if (ready && !hasPrimaryAccount(data)) router.replace('/'); }, [ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;
  const results = data.jobs.map(job => ({ job, result: jobResult(job, data.attempts.filter(a => a.jobId === job.id)) }));
  const completed = results.filter(item => item.result.success).length;
  const attention = results.filter(item => item.result.needsAttention).length;

  return <AppScreen title="签到任务">
    <XStack gap={10}>
      {([
        { label: '全部任务', value: String(data.jobs.length).padStart(2, '0'), color: '$color' },
        { label: '已签到', value: String(completed).padStart(2, '0'), color: '$success' },
        { label: '待处理', value: String(attention).padStart(2, '0'), color: attention ? '$danger' : '$muted' },
      ] as const).map(item =>
        <YStack key={item.label} flex={1} backgroundColor="$panel" borderRadius={18} padding={14} gap={4}
          shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
          <Text color={item.color} fontSize={20} fontWeight="600">{item.value}</Text>
          <Text color="$muted" fontSize={12}>{item.label}</Text>
        </YStack>)}
    </XStack>
    <SectionTitle meta={results.length ? String(results.length).padStart(2, '0') : undefined}>最近记录</SectionTitle>
    <GroupedList>{results.length ? [...results].reverse().map(({ job, result }, index) => (
      <SettingsRow key={job.id} title={job.activity.title}
        last={index === results.length - 1}
        detail={`${new Date(job.createdAt).toLocaleString()} · ${result.label}`}
        accessory={<YStack backgroundColor={result.needsAttention ? '$dangerSoft' : '$soft'} paddingHorizontal={9} paddingVertical={4} borderRadius={8}>
          <Text fontSize={12} fontWeight="500" color={result.success ? '$success' : result.needsAttention ? '$danger' : '$muted'}>
            {result.success ? '已完成' : result.needsAttention ? '待处理' : '进行中'}
          </Text>
        </YStack>}
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />
    )) : <EmptyState title="暂无签到记录" detail="从课程页发起签到后，结果将显示在这里" />}</GroupedList>
  </AppScreen>;
}
