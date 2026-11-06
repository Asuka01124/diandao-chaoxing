import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';
import appConfig from '../../../app.json';
import { GroupedList, SectionTitle } from '../../ui';
import { latestReleaseUrl, repositoryUrl, type AppRelease } from './release-update';
import { checkCachedUpdates } from './update-checker';

function AboutRow({ kind, indexLabel, title, detail, action, busy, last, onPress }: {
  kind: 'update' | 'repo'; indexLabel: string; title: string; detail: string; action?: string; busy?: boolean; last?: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  return <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={`${title}，${detail}${action ? `，${action}` : ''}`}
    accessibilityState={{ disabled: !!busy, busy: !!busy }} style={({ pressed }) => ({ backgroundColor: pressed ? theme.soft.val : theme.panel.val })}>
    <XStack minHeight={66} paddingHorizontal={17} paddingVertical={13} alignItems="center" gap={13}
      borderBottomWidth={last ? 0 : 0.7} borderColor="$separator">
      <Text width={22} fontSize={12} color="$muted" fontWeight="500">{indexLabel}</Text>
      <YStack flex={1} gap={3}><Text color="$color" fontSize={15} lineHeight={21} fontWeight="500">{title}</Text><Text color="$muted" fontSize={12} lineHeight={18}>{detail}</Text></YStack>
      {busy ? <ActivityIndicator size="small" color={theme.muted.val} /> : <>
        {!!action && <Text color="$muted" fontSize={12} lineHeight={18}>{action}</Text>}
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={kind === 'repo' ? 'M7 17 17 7M7 7h10v10' : 'm9 5 7 7-7 7'} stroke={theme.muted.val} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </>}
    </XStack>
  </Pressable>;
}

export function AboutAppSection() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const current = {
    version: Constants.expoConfig?.version ?? appConfig.expo.version,
    versionCode: Constants.expoConfig?.android?.versionCode ?? appConfig.expo.android.versionCode,
  };
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);

  async function openLink(url: string) {
    try { await Linking.openURL(url); }
    catch { if (mounted.current) { setFailed(true); setMessage('无法打开链接，请稍后重试'); } }
  }
  async function check() {
    if (pending.current) return;
    if (Platform.OS === 'ios') { await openLink(latestReleaseUrl); return; }
    if (release) { setDownloadError(''); setDialogOpen(true); return; }
    const controller = new AbortController();
    pending.current = controller;
    setChecking(true); setFailed(false); setMessage('正在检查更新…');
    try {
      const result = await checkCachedUpdates(current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.available) {
        setRelease(result.release); setDialogOpen(true);
        setMessage(`发现新版本 ${result.release.tag}`);
      } else {
        setMessage('当前已是最新版本');
      }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const text = error instanceof Error ? error.message : '无法检查更新，请稍后重试';
      setFailed(true); setMessage(text);
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        if (mounted.current) setChecking(false);
      }
    }
  }
  async function download() {
    if (!release || opening) return;
    setOpening(true); setDownloadError('');
    try {
      await Linking.openURL(Platform.OS === 'android' ? release.apkUrl : release.releaseUrl);
      if (mounted.current) setDialogOpen(false);
    } catch { if (mounted.current) setDownloadError('无法打开下载链接，请稍后重试'); }
    finally { if (mounted.current) setOpening(false); }
  }
  return <>
    <SectionTitle>关于</SectionTitle>
    <GroupedList>
      <AboutRow kind="update" indexLabel="01" title="检查更新" detail={`v${current.version}`} busy={checking}
        action={Platform.OS === 'ios' ? '查看' : release ? '发现新版本' : failed ? '重试' : undefined} onPress={() => { void check(); }} />
      <AboutRow kind="repo" indexLabel="02" title="项目主页" detail="Asuka01124/diandao-chaoxing" last onPress={() => { void openLink(repositoryUrl); }} />
    </GroupedList>
    <Text color={failed ? '$danger' : '$muted'} fontSize={12} lineHeight={18} marginTop={8} marginLeft={4} minHeight={18} accessibilityLiveRegion="polite">{message}</Text>
    <Modal visible={dialogOpen} transparent animationType="none" onRequestClose={() => setDialogOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => setDialogOpen(false)} accessibilityLabel="关闭版本更新" style={{ position: 'absolute', inset: 0, backgroundColor: theme.overlay.val }} />
        <YStack width="100%" maxWidth={680} alignSelf="center" backgroundColor="$panel" borderTopLeftRadius={24} borderTopRightRadius={24}
          paddingHorizontal={22} paddingTop={22} paddingBottom={Math.max(insets.bottom, 20)} maxHeight={height * 0.85} gap={14} accessibilityViewIsModal>
          <ScrollView style={{ flexShrink: 1, maxHeight: Math.max(96, height * 0.55) }}>
            <Text color="$color" fontSize={22} lineHeight={30} fontWeight="500" accessibilityRole="header" marginBottom={6}>发现新版本</Text>
            <Text color="$muted" fontSize={13} lineHeight={20} marginBottom={18}>v{current.version} → {release?.tag}</Text>
            <Text color="$color" fontSize={13} lineHeight={20} fontWeight="500" marginBottom={6}>更新内容</Text>
            <Text color="$muted" fontSize={13} lineHeight={21}>{release?.notes}</Text>
          </ScrollView>
          {!!downloadError && <Text color="$danger" fontSize={12} lineHeight={18} accessibilityRole="alert">{downloadError}</Text>}
          <Button minHeight={52} borderRadius={18} backgroundColor="$actionSurface" color="$actionText" fontSize={15} fontWeight="500"
            disabled={opening} accessibilityState={{ disabled: opening, busy: opening }} pressStyle={{ opacity: 0.8 }} onPress={() => { void download(); }}>
            {opening ? '正在打开…' : '前往下载'}
          </Button>
          <Pressable onPress={() => setDialogOpen(false)} accessibilityRole="button" accessibilityLabel="稍后再说" style={({ pressed }) => ({ minHeight: 42, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text color="$muted" fontSize={13}>稍后再说</Text>
          </Pressable>
        </YStack>
      </View>
    </Modal>
  </>;
}
