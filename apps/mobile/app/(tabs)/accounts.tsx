import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Input, Text, YStack } from 'tamagui';
import type { Account } from '@sign/shared';
import { ClientError } from '../../src/core/api';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { removeAccount, saveLogin, verifyAccount } from '../../src/features/accounts/account-service';
import { ActionSheet, AppScreen, EmptyState, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function AccountsScreen() {
  const store = useVault(); const data = store.data;
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [feedback, setFeedback] = useState('');
  const [selected, setSelected] = useState<string | null>(null); const [reauthId, setReauthId] = useState<string | null>(null);
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;

  async function add() {
    if (!identifier.trim() || !password) { setError('请输入账号和密码'); return; }
    setBusy(true); setError(''); setFeedback('');
    try {
      await saveLogin(store, identifier, password, { label, reauthId: reauthId ?? undefined, role: 'delegate' });
      setFeedback(reauthId ? '账号已重新登录' : '代签账号已添加');
      setIdentifier(''); setLabel(''); setReauthId(null);
    } catch (e) { setError(e instanceof Error ? e.message : '添加账号失败'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function check(id: string) {
    const account = data?.accounts.find(a => a.id === id); if (!account) return;
    setCheckingId(id); setError(''); setFeedback(`正在检查「${account.label}」…`);
    try { await verifyAccount(store, id); setFeedback(`「${account.label}」可以正常使用`); }
    catch (e) {
      setFeedback('');
      setError(e instanceof ClientError && e.code === 'REAUTH_REQUIRED'
        ? `「${account.label}」需要重新登录`
        : e instanceof Error ? `检查失败：${e.message}` : '检查失败');
    } finally { setCheckingId(null); }
  }
  async function remove(id: string) {
    setError(''); setFeedback('');
    try { await removeAccount(store, id); setFeedback('账号已删除'); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  }
  const delegates = data.accounts.filter(a => a.role === 'delegate');
  const target = delegates.find(a => a.id === selected);
  const accountRow = (account: Account) => <SettingsRow key={account.id} title={account.label}
    detail={account.state === 'REAUTH_REQUIRED' ? '需要重新登录' : account.session.identifier}
    symbol="代" onPress={() => setSelected(account.id)}
    accessory={<Text color="$brand" fontSize={13} fontWeight="600">管理 ›</Text>} />;
  return <AppScreen title="代签账号" subtitle="添加和管理同学的账号">
    <SectionTitle>代签账号</SectionTitle><GroupedList>{delegates.length ? delegates.map(accountRow) : <EmptyState title="还没有代签账号" detail="在下方添加同学的账号" />}</GroupedList>
    {!!feedback && <Text color="$brand" marginTop={14} accessibilityLiveRegion="polite">{feedback}</Text>}
    {!!checkingId && <Text color="$muted" marginTop={6}>正在连接学习通…</Text>}
    {!!error && <Text color="$danger" marginTop={14} accessibilityRole="alert">{error}</Text>}
    <SectionTitle>{reauthId ? '重新登录账号' : '添加代签账号'}</SectionTitle>
    <YStack backgroundColor="$panel" borderRadius="$panel" padding={16} gap={12} borderWidth={1} borderColor="$separator">
      <Input placeholder="显示名称（可选）" value={label} onChangeText={setLabel} accessibilityLabel="显示名称" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="学习通账号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" accessibilityLabel="账号" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="密码" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <PrimaryButton disabled={busy || !!checkingId} onPress={() => { void add(); }}>{busy ? '正在处理…' : reauthId ? '重新登录' : '添加代签账号'}</PrimaryButton>
    </YStack>
    <ActionSheet visible={!!target} title={target?.label ?? ''} onClose={() => setSelected(null)} actions={target ? [
      { label: checkingId === target.id ? '正在检查…' : '检查登录状态', onPress: () => { void check(target.id); } },
      { label: '重新登录', onPress: () => { setReauthId(target.id); setIdentifier(target.session.identifier); setLabel(target.label); setPassword(''); setFeedback('请在下方输入密码重新登录'); } },
      { label: '删除账号', danger: true, onPress: () => { void remove(target.id); } },
    ] : []} />
  </AppScreen>;
}
