import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { Account } from '@sign/shared';
import { ClientError } from '../../src/core/api';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { removeAccount, saveLogin, verifyAccount } from '../../src/features/accounts/account-service';
import { ActionSheet, AppScreen, EmptyState, GlassInput, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function AccountsScreen() {
  const store = useVault(); const data = store.data;
  const [identifier, setIdentifier] = useState(''); const [password, setPassword] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [checkingId, setCheckingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null); const [reauthId, setReauthId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const notify = useFeedback();
  const theme = useTheme();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;

  function openAddSheet() {
    setReauthId(null); setIdentifier(''); setLabel(''); setPassword('');
    setSheetOpen(true);
  }
  function closeSheet() {
    if (busy) return;
    setSheetOpen(false); setReauthId(null); setPassword('');
  }

  async function add() {
    if (!identifier.trim() || !password) { notify('请输入账号和密码', 'error'); return; }
    setBusy(true);
    notify(reauthId ? '正在重新登录…' : '正在添加账号…', 'loading');
    try {
      await saveLogin(store, identifier, password, { label, reauthId: reauthId ?? undefined, role: 'delegate' });
      notify(reauthId ? '已重新登录' : '代签账号已添加', 'success');
      setIdentifier(''); setLabel(''); setReauthId(null); setSheetOpen(false);
    } catch (e) { const message = e instanceof Error ? e.message : '添加账号失败'; notify(message, 'error'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function check(id: string) {
    const account = data?.accounts.find(a => a.id === id); if (!account) return;
    setCheckingId(id);
    notify(`正在检查「${account.label}」…`, 'loading');
    try { await verifyAccount(store, id); notify(`「${account.label}」状态正常`, 'success'); }
    catch (e) {
      const message = e instanceof ClientError && e.code === 'REAUTH_REQUIRED'
        ? `「${account.label}」需要重新登录`
        : e instanceof Error ? `检查失败：${e.message}` : '检查失败';
      notify(message, 'error');
    } finally { setCheckingId(null); }
  }
  async function remove(id: string) {
    notify('正在删除账号…', 'loading');
    try { await removeAccount(store, id); notify('账号已删除', 'success'); }
    catch (e) { const message = e instanceof Error ? e.message : '删除失败'; notify(message, 'error'); }
  }

  const delegates = data.accounts.filter(a => a.role === 'delegate');
  const target = delegates.find(a => a.id === selected);

  return <AppScreen title="代签账号" headerAction={<Pressable onPress={openAddSheet} accessibilityRole="button" accessibilityLabel="添加代签账号"
    style={({ pressed }) => ({ backgroundColor: theme.actionSurface.val, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, opacity: pressed ? 0.72 : 1 })}>
    <Text color="$actionText" fontSize={12} fontWeight="500">+ 添加</Text>
  </Pressable>}>
    <SectionTitle meta={String(delegates.length).padStart(2, '0')}>已添加</SectionTitle>
    <GroupedList>{delegates.length ? delegates.map((account: Account, index: number) => {
      const expired = account.state === 'REAUTH_REQUIRED';
      return <SettingsRow key={account.id} title={account.label}
        indexLabel={String(index + 1).padStart(2, '0')}
        detail={expired ? '需要重新登录' : account.session.identifier}
        last={index === delegates.length - 1}
        onPress={() => setSelected(account.id)}
        accessory={<Text color={expired ? '$danger' : '$muted'} fontSize={12} fontWeight="500">{expired ? '重登 ›' : '管理 ›'}</Text>} />;
    }) : <EmptyState title="暂无代签账号" detail="点击右上角「+ 添加」录入同学账号" />}</GroupedList>

    <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={closeSheet} accessibilityLabel="关闭添加账号窗口" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
        <YStack backgroundColor="$panel" borderTopLeftRadius={24} borderTopRightRadius={24} padding={22} paddingBottom={32} gap={12}>
          <XStack alignItems="center" justifyContent="space-between" marginBottom={4}>
            <Text color="$color" fontSize={18} fontWeight="500">{reauthId ? '重新登录' : '添加代签账号'}</Text>
            <Pressable onPress={closeSheet} accessibilityRole="button" accessibilityLabel="取消"
              style={({ pressed }) => ({ backgroundColor: theme.soft.val, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, opacity: pressed ? 0.65 : 1 })}>
              <Text color="$muted" fontSize={12} fontWeight="500">取消</Text>
            </Pressable>
          </XStack>
          <GlassInput placeholder="备注名（可选）" value={label} onChangeText={setLabel} accessibilityLabel="备注名" />
          <GlassInput placeholder="学习通账号" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" accessibilityLabel="账号" />
          <GlassInput placeholder="密码" value={password} onChangeText={setPassword} secureTextEntry accessibilityLabel="密码" />
          <YStack marginTop={4}><PrimaryButton loading={busy} disabled={!!checkingId} onPress={() => { void add(); }}>{reauthId ? '重新登录' : '保存账号'}</PrimaryButton></YStack>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>

    <ActionSheet visible={!!target} title={target?.label ?? ''} subtitle={target?.session.identifier} onClose={() => setSelected(null)} actions={target ? [
      { label: checkingId === target.id ? '正在检查…' : '检查登录状态', onPress: () => { void check(target.id); } },
      { label: '重新登录', onPress: () => { setReauthId(target.id); setIdentifier(target.session.identifier); setLabel(target.label); setPassword(''); setSheetOpen(true); } },
      { label: '删除账号', danger: true, onPress: () => { void remove(target.id); } },
    ] : []} />
  </AppScreen>;
}
