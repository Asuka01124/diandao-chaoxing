import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { fetch as nativeFetch } from 'expo/fetch';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';
import appConfig from '../../../app.json';
import { GroupedList, SectionTitle, useFeedback } from '../../ui';
import { checkForUpdates, latestReleaseUrl, repositoryUrl, type AppRelease } from './release-update';

function AboutIcon({ kind }: { kind: 'update' | 'repo' }) {
  const theme = useTheme();
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={theme.muted.val} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {kind === 'update' ? <><Path d="M20 7v5h-5M4 17v-5h5" /><Path d="M6.1 6.1A8 8 0 0 1 19.5 9M4.5 15a8 8 0 0 0 13.4 2.9" /></>
      : <><Path d="M6 3v12M6 9a8 8 0 0 0 8-2" /><Circle cx={6} cy={18} r={3} /><Circle cx={17} cy={5} r={3} /></>}
  </Svg>;
}

function AboutRow({ kind, title, detail, action, busy, last, onPress }: {
  kind: 'update' | 'repo'; title: string; detail: string; action?: string; busy?: boolean; last?: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  return <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={`${title}，${detail}${action ? `，${action}` : ''}`}
    accessibilityState={{ disabled: !!busy, busy: !!busy }} style={({ pressed }) => ({ backgroundColor: pressed ? theme.soft.val : theme.panel.val })}>
    <XStack minHeight={80} paddingHorizontal={17} paddingVertical={16} alignItems="center" gap={12}
      borderBottomWidth={last ? 0 : 0.7} borderColor="$separator">
      <YStack width={25} alignItems="center"><AboutIcon kind={kind} /></YStack>
      <YStack flex={1} gap={5}><Text color="$color" fontSize={15} lineHeight={23}>{title}</Text><Text color="$muted" fontSize={12} lineHeight={19}>{detail}</Text></YStack>
      {busy ? <ActivityIndicator size="small" color={theme.muted.val} /> : <>
        {!!action && <Text color="$muted" fontSize={12} lineHeight={19}>{action}</Text>}
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={kind === 'repo' ? 'M7 17 17 7M7 7h10v10' : 'm9 5 7 7-7 7'} stroke={theme.muted.val} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </>}
    </XStack>
  </Pressable>;
}

export function AboutAppSection() {
  const theme = useTheme();
  const notify = useFeedback();
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
    catch { if (mounted.current) notify('无法打开链接，请稍后重试', 'error'); }
  }
  async function check() {
    if (pending.current) return;
    if (Platform.OS === 'ios') { await openLink(latestReleaseUrl); return; }
    if (release) { setDownloadError(''); setDialogOpen(true); return; }
    const controller = new AbortController();
    pending.current = controller;
    setChecking(true); setFailed(false); setMessage('正在获取最新版本…');
    try {
      const result = await checkForUpdates(current, (url, init) => nativeFetch(url, init), controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.available) {
        setRelease(result.release); setDialogOpen(true);
        setMessage(`发现新版本 ${result.release.tag}`);
      } else {
        setMessage('当前已是最新版本'); notify('当前已是最新版本', 'info');
      }
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const text = error instanceof Error ? error.message : '无法检查更新，请稍后重试';
      setFailed(true); setMessage(text); notify(text, 'error');
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
    <SectionTitle>关于到点</SectionTitle>
    <GroupedList>
      <AboutRow kind="update" title="版本更新" detail={`当前版本 v${current.version}`} busy={checking}
        action={Platform.OS === 'ios' ? '版本发布' : release ? '发现更新' : failed ? '重试' : '检查更新'} onPress={() => { void check(); }} />
      <AboutRow kind="repo" title="GitHub 仓库" detail="Asuka01124/diandao-chaoxing" last onPress={() => { void openLink(repositoryUrl); }} />
    </GroupedList>
    <Text color={failed ? '$danger' : '$muted'} fontSize={12} lineHeight={19} marginTop={9} marginLeft={3} minHeight={19} accessibilityLiveRegion="polite">{message}</Text>
    <Modal visible={dialogOpen} transparent animationType="none" onRequestClose={() => setDialogOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => setDialogOpen(false)} accessibilityLabel="关闭版本更新" style={{ position: 'absolute', inset: 0, backgroundColor: theme.overlay.val }} />
        <YStack width="100%" maxWidth={680} alignSelf="center" backgroundColor="$panel" borderTopLeftRadius={26} borderTopRightRadius={26}
          paddingHorizontal={24} paddingTop={24} paddingBottom={Math.max(insets.bottom, 20)} maxHeight={height * 0.85} gap={14} accessibilityViewIsModal>
          <ScrollView style={{ flexShrink: 1, maxHeight: Math.max(96, height * 0.55) }}>
            <Text color="$color" fontSize={24} lineHeight={32} fontWeight="500" accessibilityRole="header" marginBottom={9}>发现新版本</Text>
            <Text color="$color" fontSize={15} lineHeight={23} marginBottom={22}>v{current.version} → {release?.tag}</Text>
            <Text color="$color" fontSize={14} lineHeight={22} fontWeight="500" marginBottom={8}>更新内容</Text>
            <Text color="$muted" fontSize={14} lineHeight={23}>{release?.notes}</Text>
          </ScrollView>
          {!!downloadError && <Text color="$danger" fontSize={12} lineHeight={19} accessibilityRole="alert">{downloadError}</Text>}
          <Button minHeight={50} borderRadius={16} backgroundColor="$color" color="$panel" fontSize={15} fontWeight="500"
            disabled={opening} accessibilityState={{ disabled: opening, busy: opening }} pressStyle={{ opacity: 0.8 }} onPress={() => { void download(); }}>
            {opening ? '正在打开…' : '前往下载'}
          </Button>
          <Pressable onPress={() => setDialogOpen(false)} accessibilityRole="button" accessibilityLabel="稍后再说" style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <Text color="$muted" fontSize={14}>稍后再说</Text>
          </Pressable>
        </YStack>
      </View>
    </Modal>
  </>;
}
