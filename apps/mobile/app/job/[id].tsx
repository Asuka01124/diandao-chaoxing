import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import type { Attempt, AttemptState } from '@sign/shared';
import { api } from '../../src/core/api';
import { checkChallenge, provideFaceAndResume, replacePhotoAndRetry, replaceQrAndResume, retryAttempt, runJob, isJobRunning, subscribeJobRunner } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { ReservedPhotoRow } from '../../src/features/photos/reserved-photo-row';
import { ActionSheet, AppScreen, EmptyState, GroupedList, PrimaryButton, SectionTitle, SettingsRow, StatusBadge, useFeedback } from '../../src/ui';

const kindLabels: Record<string, string> = { click: '点击签到', location: '位置签到', photo: '照片签到', qr: '二维码签到', code: '验证码签到', gesture: '手势签到', unknown: '签到' };
const stamp = (time: string) => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const isActive = (state: AttemptState) => state.startsWith('WAITING_') || ['QUEUED', 'PREFLIGHT', 'SUBMITTING', 'VERIFYING'].includes(state);

function StrokeIcon({ d, size, color, viewBox = '0 0 24 24' }: { d: string; size: number; color: string; viewBox?: string }) {
  return <Svg width={size} height={size} viewBox={viewBox} fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d={d} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

type Sheet = { kind: 'info' } | { kind: 'account'; accountId: string } | { kind: 'pick'; camera: boolean } | null;

export default function JobScreen() {
  const { id, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const notify = useFeedback();
  const theme = useTheme();
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [openObjects, setOpenObjects] = useState(true);
  const [openItems, setOpenItems] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [reservedPickerAccountId, setReservedPickerAccountId] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const executing = useSyncExternalStore(subscribeJobRunner, () => isJobRunning(id), () => false);
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload && scannedAt && id) {
    void replaceQrAndResume(store, id, qrPayload, scannedAt).catch(e => { notify(e instanceof Error ? e.message : '更新二维码失败', 'error'); });
  } }, [qrPayload, scannedAt]);
  const job = data?.jobs.find(j => j.id === id);
  if (!data || !job) return <AppScreen title="签到结果" backLabel="任务" onBack={() => router.back()}>
    {store.ready && data && !job && <EmptyState title="未找到这条签到记录" />}
  </AppScreen>;

  async function runAction(key: string, action: () => Promise<boolean | void>) {
    if (actionRunning.current) return;
    actionRunning.current = true; setActiveAction(key);
    try { await action(); }
    catch (e) { notify(e instanceof Error ? e.message : '操作失败，请重试', 'error'); }
    finally { actionRunning.current = false; setActiveAction(null); }
  }

  async function provideFace(accountId: string, camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (picked.canceled) return false;
    return provideFaceFromUri(accountId, picked.assets[0].uri);
  }

  async function provideFaceFromUri(accountId: string, source: string) {
    const account = store.get().accounts.find(a => a.id === accountId); if (!account) throw new Error('账号已删除');
    const converted = await ImageManipulator.manipulateAsync(source, [], { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG });
    const file = new File(converted.uri);
    try {
      const session = await api.check(account.session);
      await store.update(v => { const item = v.accounts.find(a => a.id === accountId); if (item) item.session = session; });
      const { mediaId } = await api.upload(session, await file.base64());
      await provideFaceAndResume(store, id, accountId, mediaId);
      return true;
    } finally { if (file.exists) file.delete(); if (source.startsWith(Paths.cache.uri)) { const original = new File(source); if (original.exists) original.delete(); } }
  }

  async function providePhoto(accountId: string, camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (picked.canceled) return false;
    await retryWithPhoto(accountId, picked.assets[0].uri);
    return true;
  }

  async function retryWithPhoto(accountId: string, sourceUri: string) {
    const staged = await stagePhoto(sourceUri);
    try { await replacePhotoAndRetry(store, id, accountId, staged); return true; }
    catch (error) { const saved = store.get().jobs.find(j => j.id === id); if (saved?.photoUriByAccount?.[accountId] !== staged && saved?.photoUri !== staged) clearStagedPhoto(staged); throw error; }
  }

  const attempts = data.attempts.filter(a => a.jobId === id);
  const accountLabel = (accountId: string) => data.accounts.find(a => a.id === accountId)?.label ?? '已删除账号';
  const signedAll = attempts.length > 0 && attempts.every(a => a.state === 'SUCCESS' || a.state === 'ALREADY_SIGNED');
  const faceTargets = attempts.filter(a => a.state === 'WAITING_FACE');
  const captchaTargets = attempts.filter(a => a.state === 'WAITING_CAPTCHA');
  const confirmationTargets = attempts.filter(a => a.state === 'WAITING_CONFIRMATION');
  const inputTargets = attempts.filter(a => a.state === 'FAILED' && a.code === 'SIGN_INPUT_CHANGED');
  const failedTargets = attempts.filter(a => (a.state === 'FAILED' && a.code !== 'SIGN_INPUT_CHANGED') || a.state === 'REAUTH_REQUIRED');
  const photoTargets = job.input.kind === 'photo' ? failedTargets.filter(a => a.state === 'FAILED') : [];
  const qrWaiting = attempts.some(a => a.state === 'WAITING_QR');
  const dockMode = faceTargets.length ? 'face' as const : photoTargets.length ? 'photo' as const : null;
  const dockTargets = dockMode === 'face' ? faceTargets : photoTargets;

  function prepareAgain(accountIds: string[]) {
    if (!job || executing) return;
    const available = accountIds.filter(accountId => store.get().accounts.some(account => account.id === accountId));
    if (!available.length) { notify('请选择仍在登录的账号', 'error'); return; }
    router.push({ pathname: '/prepare/[id]', params: {
      id: job.activity.id, accountId: available[0], previousJobId: id, selectedIds: available.join(','),
    } });
  }

  async function checkWaiting() {
    let first: unknown = null;
    for (const attempt of [...confirmationTargets, ...captchaTargets, ...faceTargets]) {
      try { await checkChallenge(store, id, attempt.accountId); } catch (e) { first ??= e; }
    }
    if (first) throw first;
  }
  async function retryFailed() {
    let first: unknown = null;
    for (const attempt of failedTargets) {
      try { await retryAttempt(store, id, attempt.accountId); } catch (e) { first ??= e; }
    }
    if (first) throw first;
  }
  const resultAction = inputTargets.length > 0 ? { key: 'prepare', label: '重新准备签到', run: async () => prepareAgain(inputTargets.map(a => a.accountId)) }
    : confirmationTargets.length + captchaTargets.length + faceTargets.length > 0 ? { key: 'check', label: '检查结果', run: checkWaiting }
    : failedTargets.length > 0 ? { key: 'retry', label: '检查并重试', run: retryFailed } : null;

  const accountActions = (attempt: Attempt) => {
    const accountId = attempt.accountId;
    const list: { label: string; onPress: () => void }[] = [];
    const check = { label: '检查学习通签到结果', onPress: () => { void runAction(`challenge-${accountId}`, () => checkChallenge(store, id, accountId)); } };
    if (attempt.state === 'FAILED' && attempt.code === 'SIGN_INPUT_CHANGED') {
      list.push({ label: '重新准备签到', onPress: () => prepareAgain([accountId]) });
    } else if (attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED') {
      list.push({ label: '检查并重试', onPress: () => { void runAction(`retry-${accountId}`, () => retryAttempt(store, id, accountId)); } });
      if (attempt.state === 'FAILED' && job.input.kind === 'photo') {
        list.push({ label: '拍照重试', onPress: () => { void runAction(`photo-camera-${accountId}`, () => providePhoto(accountId, true)); } });
        list.push({ label: '选相册重试', onPress: () => { void runAction(`photo-library-${accountId}`, () => providePhoto(accountId, false)); } });
        if (data.settings.reservedPhotos.length) list.push({ label: reservedPickerAccountId === accountId ? '收起预留照片' : '用预留照片重试', onPress: () => setReservedPickerAccountId(current => current === accountId ? null : accountId) });
      }
    }
    if (attempt.state === 'WAITING_FACE') {
      list.push({ label: '拍照上传', onPress: () => { void runAction(`face-camera-${accountId}`, () => provideFace(accountId, true)); } });
      list.push({ label: '选授权照片', onPress: () => { void runAction(`face-library-${accountId}`, () => provideFace(accountId, false)); } });
      if (data.settings.reservedPhotos.length) list.push({ label: reservedPickerAccountId === accountId ? '收起预留照片' : '用预留照片验证', onPress: () => setReservedPickerAccountId(current => current === accountId ? null : accountId) });
      list.push(check);
    }
    if (attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_CONFIRMATION') list.push(check);
    if (attempt.state === 'WAITING_QR') list.push({ label: '重新扫码并继续', onPress: () => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } }) });
    return list;
  };

  function startPicker(camera: boolean, accountId?: string) {
    if (!dockMode) return;
    const target = accountId ?? (dockTargets.length === 1 ? dockTargets[0].accountId : undefined);
    if (!target) { setSheet({ kind: 'pick', camera }); return; }
    void runAction(`dock-${camera ? 'camera' : 'album'}`, () => dockMode === 'face' ? provideFace(target, camera) : providePhoto(target, camera));
  }

  const requirements = job.activity.requirements;
  const photoStatus = signedAll ? undefined : job.photoUri ? '已添加照片' : '待添加照片';
  const itemRows: { label: string; meta?: string; active: boolean }[] = [{
    label: kindLabels[job.input.kind] ?? '签到',
    meta: job.input.kind === 'photo' ? photoStatus : undefined,
    active: job.input.kind === 'qr' ? qrWaiting : photoTargets.length > 0,
  }];
  if (requirements?.captcha) itemRows.push({ label: '验证码', active: captchaTargets.length > 0 });
  if (requirements?.face) itemRows.push({
    label: '人脸验证',
    meta: faceTargets.some(a => !job.faceMediaIdByAccount?.[a.accountId]) ? '待添加照片' : undefined,
    active: faceTargets.length > 0,
  });
  if (requirements?.location) itemRows.push({ label: '位置', meta: 'location' in job.input && job.input.location ? '已填写' : undefined, active: false });
  if (requirements?.photo && job.input.kind !== 'photo') itemRows.push({ label: '照片', meta: photoStatus, active: photoTargets.length > 0 });

  const groupHeader = (label: string, open: boolean, toggle: () => void) =>
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={`${label}，${open ? '收起' : '展开'}`} accessibilityState={{ expanded: open }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <SectionTitle action={<Svg width={12} height={12} viewBox="0 0 16 16" fill="none" style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="m3 6 5 5 5-5" stroke={theme.muted.val} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>}>{label}</SectionTitle>
    </Pressable>;

  const footer = dockMode ? <XStack alignItems="center" gap={8} backgroundColor="$panel" borderRadius={40} paddingLeft={14} paddingRight={6} paddingVertical={5}
    shadowColor="#000000" shadowOpacity={0.05} shadowRadius={27} shadowOffset={{ width: 0, height: 5 }} elevation={3}>
    <Pressable disabled={!!activeAction} onPress={() => startPicker(false)} accessibilityRole="button" accessibilityLabel="选择授权照片"
      style={({ pressed }) => ({ flex: 1, minHeight: 44, justifyContent: 'center', opacity: activeAction ? 0.55 : pressed ? 0.65 : 1 })}>
      <XStack alignItems="center" gap={17}>
        <StrokeIcon d="M12 5v14M5 12h14" size={21} color={theme.color.val} />
        <Text color="$muted" fontSize={16}>选择授权照片</Text>
      </XStack>
    </Pressable>
    <Pressable disabled={!!activeAction} onPress={() => startPicker(true)} accessibilityRole="button" accessibilityLabel="拍照"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.actionSurface.val, alignItems: 'center', justifyContent: 'center', opacity: activeAction ? 0.55 : pressed ? 0.65 : 1 })}>
      {activeAction?.startsWith('dock-') ? <ActivityIndicator color={theme.actionText.val} /> : <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M4 7h4l2-3h4l2 3h4a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 4 7Z" stroke={theme.actionText.val} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={12} cy={13} r={3.6} stroke={theme.actionText.val} strokeWidth={1.75} />
      </Svg>}
    </Pressable>
  </XStack>
    : qrWaiting ? <PrimaryButton variant="dock" onPress={() => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } })}>重新扫码并继续</PrimaryButton>
      : job.state === 'RUNNING' && !executing ? <PrimaryButton variant="dock" loading={activeAction === 'continue'} disabled={!!activeAction} onPress={() => { void runAction('continue', () => runJob(store, job.id)); }}>继续签到</PrimaryButton>
        : undefined;

  const requirementText = requirements ? [requirements.captcha && '验证码', requirements.face && '人脸', requirements.location && '位置', requirements.photo && '照片'].filter(Boolean).join('、') : '';
  const sheetAttempt = sheet?.kind === 'account' ? attempts.find(a => a.accountId === sheet.accountId) : undefined;

  return <AppScreen title="签到结果" backLabel="任务" onBack={() => router.back()}
    headerAction={<Pressable onPress={() => setSheet({ kind: 'info' })} accessibilityRole="button" accessibilityLabel="更多签到信息"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.panel.val, opacity: pressed ? 0.6 : 1, shadowColor: '#000000', shadowOpacity: 0.03, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 })}>
      <Svg width={19} height={19} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Circle cx={4} cy={12} r={2} fill={theme.color.val} /><Circle cx={12} cy={12} r={2} fill={theme.color.val} /><Circle cx={20} cy={12} r={2} fill={theme.color.val} />
      </Svg>
    </Pressable>}
    footer={footer}>
    <XStack gap={7} marginBottom={8}>
      {(['current', 'history'] as const).map(key => {
        const active = tab === key;
        return <Pressable key={key} onPress={() => setTab(key)} accessibilityRole="button" accessibilityLabel={key === 'current' ? '本次签到' : '操作记录'} accessibilityState={{ selected: active }}
          style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <XStack minHeight={34} alignItems="center" gap={7} paddingHorizontal={14} borderRadius={24} backgroundColor={active ? '$actionSurface' : '$soft'}>
            {key === 'current' && <StrokeIcon d="M3 8V4h5m8 0h5v4m0 8v4h-5m-8 0H3v-4M6 12h12" size={15} color={active ? theme.actionText.val : theme.color.val} />}
            <Text fontSize={14} color={active ? '$actionText' : '$color'}>{key === 'current' ? '本次签到' : '操作记录'}</Text>
          </XStack>
        </Pressable>;
      })}
    </XStack>
    {resultAction && <YStack alignSelf="flex-start">
      <PrimaryButton variant="secondary" loading={activeAction === resultAction.key} disabled={!!activeAction || executing}
        onPress={() => { void runAction(resultAction.key, resultAction.run); }}>{resultAction.label}</PrimaryButton>
    </YStack>}
    {tab === 'current' ? <>
      {groupHeader('签到对象', openObjects, () => setOpenObjects(v => !v))}
      {openObjects && <GroupedList>{attempts.map(attempt => {
        const actions = accountActions(attempt);
        return <YStack key={attempt.accountId}>
          <SettingsRow title={accountLabel(attempt.accountId)}
            detail={attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED' || attempt.state === 'WAITING_CONFIRMATION' ? attempt.message : undefined}
            selected={isActive(attempt.state)}
            accessory={<StatusBadge state={attempt.state} />}
            onPress={actions.length ? () => setSheet({ kind: 'account', accountId: attempt.accountId }) : undefined} />
          {reservedPickerAccountId === attempt.accountId && <GroupedList>{data.settings.reservedPhotos.map((photo, photoIdx) =>
            <ReservedPhotoRow key={photo.id} photo={photo} index={photoIdx} last={photoIdx === data.settings.reservedPhotos.length - 1}
              onSelect={() => {
                if (!reservedPhotoExists(photo.id)) { notify('该照片已丢失，请重新添加', 'error'); return; }
                setReservedPickerAccountId(null);
                void runAction(`reserved-${attempt.accountId}`, () => attempt.state === 'WAITING_FACE' ? provideFaceFromUri(attempt.accountId, reservedPhotoUri(photo.id)) : retryWithPhoto(attempt.accountId, reservedPhotoUri(photo.id)));
              }} />)}</GroupedList>}
        </YStack>;
      })}</GroupedList>}
      {groupHeader('验证项目', openItems, () => setOpenItems(v => !v))}
      {openItems && <GroupedList>{itemRows.map(row => <SettingsRow key={row.label} title={row.label} value={row.meta} selected={row.active} />)}</GroupedList>}
    </> : <>
      <SectionTitle>最近状态</SectionTitle>
      <GroupedList>
        {[...attempts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(attempt =>
          <SettingsRow key={attempt.accountId} title={accountLabel(attempt.accountId)} accessory={<StatusBadge state={attempt.state} />} value={stamp(attempt.updatedAt)} />)}
        <SettingsRow title="创建签到任务" value={stamp(job.createdAt)} />
      </GroupedList>
    </>}
    <ActionSheet visible={sheet?.kind === 'info'} title="签到信息"
      subtitle={[job.activity.title, (kindLabels[job.activity.kind] ?? '签到') + (requirementText ? ` · ${requirementText}` : ''), job.activity.endTime ? `截止 ${new Date(job.activity.endTime).toLocaleString()}` : ''].filter(Boolean).join('\n')}
      actions={[]} onClose={() => setSheet(null)} />
    <ActionSheet visible={sheet?.kind === 'account' && !!sheetAttempt} title={sheetAttempt ? accountLabel(sheetAttempt.accountId) : ''}
      actions={sheetAttempt ? accountActions(sheetAttempt) : []} onClose={() => setSheet(null)} />
    <ActionSheet visible={sheet?.kind === 'pick'} title={sheet?.kind === 'pick' && sheet.camera ? '为哪个账号拍照？' : '为哪个账号选择照片？'}
      actions={dockTargets.map(attempt => ({ label: accountLabel(attempt.accountId), onPress: () => { if (sheet?.kind === 'pick') startPicker(sheet.camera, attempt.accountId); } }))} onClose={() => setSheet(null)} />
  </AppScreen>;
}