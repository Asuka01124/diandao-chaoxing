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
      setFeedback(reauthId ? '账号已重新授权' : '代签账号已添加');
      setIdentifier(''); setLabel(''); setReauthId(null);
    } catch (e) { setError(e instanceof Error ? e.message : '添加账号失败'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function check(id: string) {
    const account = data?.accounts.find(a => a.id === id); if (!account) return;
    setCheckingId(id); setError(''); setFeedback(`正在检查「${account.label}」的授权是否过期…`);
    try { await verifyAccount(store, id); setFeedback(`「${account.label}」授权有效，可以正常使用`); }
    catch (e) {
      setFeedback('');
      setError(e instanceof ClientError && e.code === 'REAUTH_REQUIRED'
        ? `「${account.label}」的授权已过期，请在下方重新登录`
        : e instanceof Error ? `检查失败：${e.message}` : '授权检查失败');
    } finally { setCheckingId(null); }
  }
  async function remove(id: string) {
    setError(''); setFeedback('');
    try { await removeAccount(store, id); setFeedback('账号已删除'); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败'); }
  }
  const main = data.accounts.find(a => a.role === 'primary');
  const delegates = data.accounts.filter(a => a.role === 'delegate');
  const target = data.accounts.find(a => a.id === selected);
  const accountRow = (account: Account) => <SettingsRow key={account.id} title={account.label}
    detail={`${account.session.identifier} · ${account.state === 'REAUTH_REQUIRED' ? '授权已过期' : account.state === 'VALID' ? '授权有效' : '授权待检查'}`}
    symbol={account.role === 'primary' ? '主' : '代'} onPress={() => setSelected(account.id)}
    accessory={<Text color="$brand" fontSize={13} fontWeight="600">管理 ›</Text>} />;
  return <AppScreen title="账号" subtitle="主账号与代签账号分别管理">
    <HeroCard eyebrow="账号管理" title={`我的主账号 · ${delegates.length} 个代签账号`} detail="首次登录的账号是主账号；在这里添加的账号只用于代签。账号资料加密保存在本机。" />
    <SectionTitle>我的主账号</SectionTitle><GroupedList>{main && accountRow(main)}</GroupedList>
    <SectionTitle>代签账号</SectionTitle><GroupedList>{delegates.length ? delegates.map(accountRow) : <EmptyState title="还没有代签账号" detail="在下方添加已授权的账号" />}</GroupedList>
    {!!feedback && <Text color="$brand" marginTop={14} accessibilityLiveRegion="polite">{feedback}</Text>}
    {!!checkingId && <Text color="$muted" marginTop={6}>请稍候，正在连接学习通…</Text>}
    {!!error && <Text color="$danger" marginTop={14} accessibilityRole="alert">{error}</Text>}
    <SectionTitle>{reauthId ? '重新登录账号' : '添加代签账号'}</SectionTitle>
    <YStack backgroundColor="$panel" borderRadius="$panel" padding={16} gap={12} borderWidth={1} borderColor="$separator">
      <Input placeholder="显示名称（可选）" value={label} onChangeText={setLabel} accessibilityLabel="显示名称" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="学习通账号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" accessibilityLabel="账号" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="密码" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <PrimaryButton disabled={busy || !!checkingId} onPress={() => { void add(); }}>{busy ? '正在处理…' : reauthId ? '重新登录并更新授权' : '添加代签账号'}</PrimaryButton>
    </YStack>
    <ActionSheet visible={!!target} title={target?.label ?? ''} onClose={() => setSelected(null)} actions={target ? [
      { label: checkingId === target.id ? '正在检查授权…' : '检查账号授权是否过期', onPress: () => { void check(target.id); } },
      { label: '重新登录此账号', onPress: () => { setReauthId(target.id); setIdentifier(target.session.identifier); setLabel(target.label); setPassword(''); setFeedback('请在下方输入密码重新登录'); } },
      { label: target.role === 'primary' ? '删除主账号并返回登录页' : '删除代签账号及相关资料', danger: true, onPress: () => { void remove(target.id); } },
    ] : []} />
  </AppScreen>;
}
