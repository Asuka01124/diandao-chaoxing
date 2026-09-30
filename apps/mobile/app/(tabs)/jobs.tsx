import { useEffect } from 'react';
import { router } from 'expo-router';
import { useVault } from '../../src/state';
import { AppScreen, EmptyState, GroupedList, HeroCard, SectionTitle, SettingsRow } from '../../src/ui';

export default function JobsScreen() {
  const { data, ready } = useVault(); useEffect(() => { if (ready && !data?.accounts.length) router.replace('/'); }, [ready, data?.accounts.length]); if (!data?.accounts.length) return null;
  const completed = data.jobs.filter(job => job.state === 'DONE').length;
  return <AppScreen title="任务" subtitle="每个账号的签到结果独立记录">
    <HeroCard eyebrow="任务概览" title={`${completed} 个任务已完成`} detail="所有任务和结果都加密保存在本机。提交超时后会先核查远端状态。" />
    <SectionTitle>最近任务</SectionTitle><GroupedList>{data.jobs.length ? [...data.jobs].reverse().map(job => <SettingsRow key={job.id} title={job.activity.title} detail={`${new Date(job.createdAt).toLocaleString()} · ${job.state === 'DONE' ? '已完成' : job.state === 'WAITING' ? '等待输入' : '执行中'}`} symbol={job.state === 'DONE' ? '✓' : '…'} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />) : <EmptyState title="还没有任务" detail="在课程页选择签到活动，即可开始创建任务" />}</GroupedList>
  </AppScreen>;
}
