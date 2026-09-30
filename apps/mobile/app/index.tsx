import { useEffect } from 'react';
import { router } from 'expo-router';
import { YStack } from 'tamagui';
import { AppScreen, HeroCard, Message, PrimaryButton } from '../src/ui';
import { useVault } from '../src/state';
import { cleanupCompletedPhoto, runJob } from '../src/core/jobs';

export default function UnlockScreen() {
  const store = useVault();
  useEffect(() => { if (store.data) { router.replace('/(tabs)/accounts'); for (const job of store.data.jobs) { if (job.state === 'RUNNING') void runJob(store, job.id); else if (job.state === 'DONE') void cleanupCompletedPhoto(store, job.id).catch(() => {}); } } }, [store.data !== null]);
  return <AppScreen title="多账号签到" subtitle="安全地管理课程签到"><YStack gap={20}>
    <HeroCard eyebrow="欢迎回来" title="你的签到工作台" detail="用设备锁屏验证解锁。账号、会话和任务结果只保存在本机加密文件中。" />
    {store.error && <Message>{store.error}</Message>}
    <PrimaryButton onPress={() => { void store.unlock(); }}>解锁并继续</PrimaryButton>
  </YStack></AppScreen>;
}
