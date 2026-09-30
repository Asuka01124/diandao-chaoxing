import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Input, Text, XStack, YStack } from 'tamagui';
import { useVault } from '../../src/state';
import { removeAccount, saveLogin, verifyAccount } from '../../src/features/accounts/account-service';
import { ActionSheet, AppScreen, EmptyState, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function AccountsScreen() {
  const store = useVault(); const data = store.data;
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState<string | null>(null); const [reauthId, setReauthId] = useState<string | null>(null);
  useEffect(() => { if (store.ready && !data?.accounts.length) router.replace('/'); }, [store.ready, data?.accounts.length]);
  if (!data?.accounts.length) return null;
  async function add() {
    if (!identifier.trim() || !password) { setError('请输入账号和密码'); return; }
    setBusy(true); setError('');
    try {
      await saveLogin(store, identifier, password, label, reauthId ?? undefined);
      setIdentifier(''); setLabel(''); setReauthId(null);
    } catch (e) { setPassword(''); setError(e instanceof Error ? e.message : '添加账号失败'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function check(id: string) {
    setBusy(true); setError('');
    try { await verifyAccount(store, id); }
    catch (e) { setError(e instanceof Error ? e.message : '验证失败'); }
    finally { setBusy(false); }
  }
  const target = data.accounts.find(a => a.id === selected);
  return <AppScreen title="账号" subtitle="管理你已授权的学习通账号">
    <HeroCard eyebrow="安全存储" title={`${data.accounts.length} 个已授权账号`} detail="每个账号拥有独立会话，资料仅保存在这台设备的加密文件中。" />
    <SectionTitle>已授权账号</SectionTitle>
    <GroupedList>{data.accounts.length ? data.accounts.map(account => <SettingsRow key={account.id} title={account.label} detail={`${account.session.identifier} · ${account.state === 'VALID' ? '会话有效' : account.state === 'REAUTH_REQUIRED' ? '需重新授权' : '待验证'}`} onPress={() => setSelected(account.id)} symbol={account.label.slice(0, 1)} accessory={<Text color="$brand" fontSize={13} fontWeight="600">管理 ›</Text>} />) : <EmptyState title="还没有账号" detail="在下方添加你本人或已授权的账号" />}</GroupedList>
    <SectionTitle>{reauthId ? '重新授权' : '添加账号'}</SectionTitle>
    <YStack backgroundColor="$panel" borderRadius="$panel" padding={16} gap={12} borderWidth={1} borderColor="$separator">
      <Input placeholder="显示名称（可选）" value={label} onChangeText={setLabel} accessibilityLabel="显示名称" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="账号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" accessibilityLabel="账号" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <Input placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="密码" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <PrimaryButton disabled={busy} onPress={() => { void add(); }}>{busy ? '正在处理…' : reauthId ? '重新登录并更新会话' : '添加并验证'}</PrimaryButton>
    </YStack>
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
    <ActionSheet visible={!!target} title={target?.label ?? ''} onClose={() => setSelected(null)} actions={target ? [
      { label: '验证会话', onPress: () => { void check(target.id); } },
      { label: '重新授权', onPress: () => { setReauthId(target.id); setIdentifier(target.session.identifier); setLabel(target.label); setPassword(''); } },
      { label: '删除账号及相关资料', danger: true, onPress: () => { void removeAccount(store, target.id).catch(e => setError(e instanceof Error ? e.message : '删除失败')); } },
    ] : []} />
  </AppScreen>;
}
