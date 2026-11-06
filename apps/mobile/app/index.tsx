import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useVault } from '../src/state';
import { cleanupCompletedPhoto, runJob } from '../src/core/jobs';
import { saveLogin } from '../src/features/accounts/account-service';
import { hasPrimaryAccount } from '../src/features/accounts/account-role';
import { AppScreen, FeedbackNotice, GlassInput, PrimaryButton, useFeedback } from '../src/ui';

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
    setReloading(true); notify('正在重新读取…', 'loading');
    void store.reload().then(() => notify('已重新读取', 'success')).catch(e => notify(e instanceof Error ? e.message : '读取失败', 'error')).finally(() => setReloading(false));
  }}>重试</PrimaryButton></YStack></AppScreen>;
  if (hasPrimaryAccount(store.data)) return null;

  async function submit() {
    if (!identifier.trim() || !password) { setError('请输入学习通账号和密码'); return; }
    setBusy(true); setError('');
    try { await saveLogin(store, identifier, password, { role: 'primary' }); setPassword(''); notify('登录成功', 'success'); router.replace('/(tabs)/courses'); }
    catch (e) { setError(e instanceof Error ? e.message : '登录失败，请稍后再试'); }
    finally { setBusy(false); }
  }
  return <AppScreen title="登录学习通" subtitle="账号资料加密保存在本机">
    <YStack backgroundColor="$panel" borderRadius="$radius.panel" padding={20} gap={14}
      shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
      <Text color="$muted" fontSize={12} fontWeight="500">学习通账号</Text>
      <GlassInput placeholder="手机号 / 学号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} accessibilityLabel="学习通账号" />
      <Text color="$muted" fontSize={12} fontWeight="500">密码</Text>
      <GlassInput placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="学习通密码" />
      {!!error && <FeedbackNotice message={error} tone="error" />}
      <YStack marginTop={4}><PrimaryButton loading={busy} onPress={() => { void submit(); }}>{busy ? '正在登录…' : '登录'}</PrimaryButton></YStack>
    </YStack>
  </AppScreen>;
}
