import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Input, YStack } from 'tamagui';
import { useVault } from '../src/state';
import { cleanupCompletedPhoto, runJob } from '../src/core/jobs';
import { saveLogin } from '../src/features/accounts/account-service';
import { hasPrimaryAccount } from '../src/features/accounts/account-role';
import { AppScreen, FeedbackNotice, HeroCard, Message, PrimaryButton, useFeedback } from '../src/ui';

export default function LoginScreen() {
  const store = useVault();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);
  const notify = useFeedback();
  const resumed = useRef(false);
  useEffect(() => {
    const data = store.data;
    if (!store.ready || !hasPrimaryAccount(data)) { resumed.current = false; return; }
    if (!resumed.current) {
      resumed.current = true;
      for (const job of data!.jobs) {
        if (job.state === 'RUNNING') void runJob(store, job.id);
        else if (job.state === 'DONE') void cleanupCompletedPhoto(store, job.id).catch(() => {});
      }
    }
    router.replace('/(tabs)/courses');
  }, [store.ready, store.data?.accounts]);

  if (!store.ready) return <AppScreen title="学习通登录"><FeedbackNotice message="正在读取本机资料…" tone="loading" /></AppScreen>;
  if (!store.data) return <AppScreen title="无法读取资料"><FeedbackNotice message={store.error ?? '请重试'} tone="error" /><YStack marginTop={20}><PrimaryButton loading={reloading} onPress={() => {
    setReloading(true); notify('正在重新读取资料…', 'loading');
    void store.reload().then(() => notify('本机资料已重新读取', 'success')).catch(e => notify(e instanceof Error ? e.message : '读取失败', 'error')).finally(() => setReloading(false));
  }}>重试</PrimaryButton></YStack></AppScreen>;
  if (hasPrimaryAccount(store.data)) return null;

  async function submit() {
    if (!identifier.trim() || !password) { setError('请输入学习通账号和密码'); notify('请输入学习通账号和密码', 'error'); return; }
    setBusy(true); setError('');
    notify('正在登录学习通…', 'loading');
    try { await saveLogin(store, identifier, password, { role: 'primary' }); setPassword(''); notify('登录成功，正在进入课程', 'success'); router.replace('/(tabs)/courses'); }
    catch (e) { const message = e instanceof Error ? e.message : '登录失败'; setError(message); notify(message, 'error'); }
    finally { setBusy(false); }
  }
  return <AppScreen title="登录学习通" subtitle="使用学习通账号进入课程首页">
    <HeroCard eyebrow="欢迎使用" title="课程与签到" detail="首次登录后即可查看课程。账号资料加密保存在这台设备。" />
    <YStack backgroundColor="$panel" borderRadius="$panel" padding={18} marginTop={24} gap={14}>
      <Input placeholder="学习通账号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} accessibilityLabel="学习通账号" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={50} />
      <Input placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="学习通密码" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={50} />
      <PrimaryButton loading={busy} onPress={() => { void submit(); }}>{busy ? '正在登录…' : '登录并进入课程'}</PrimaryButton>
    </YStack>
    {!!error && <YStack marginTop={14}><FeedbackNotice message={error} tone="error" /></YStack>}
  </AppScreen>;
}
