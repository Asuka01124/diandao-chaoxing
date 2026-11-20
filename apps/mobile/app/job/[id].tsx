import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { api } from '../../src/core/api';
import { checkChallenge, provideFaceAndResume, replacePhotoAndRetry, replaceQrAndResume, retryAttempt, runJob, isJobRunning, subscribeJobRunner } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { isPracticeActivity } from '../../src/features/courses/demo-course';
import { practiceQrPayload } from '../../src/features/courses/practice-server';
import { ReservedPhotoRow } from '../../src/features/photos/reserved-photo-row';
import { AppScreen, FeedbackNotice, GroupedList, PrimaryButton, SettingsRow, StatusBadge } from '../../src/ui';

export default function JobScreen() {
  const { id, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const [error, setError] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [reservedPickerAccountId, setReservedPickerAccountId] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const executing = useSyncExternalStore(subscribeJobRunner, () => isJobRunning(id), () => false);
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload && scannedAt && id) {
    void replaceQrAndResume(store, id, qrPayload, scannedAt).catch(e => { setError(e instanceof Error ? e.message : '更新二维码失败'); });
  } }, [qrPayload, scannedAt]);
  const job = data?.jobs.find(j => j.id === id);
  if (!data || !job) return <AppScreen title="签到结果" backLabel="任务" onBack={() => router.back()}>
    {store.ready && data && !job && <FeedbackNotice message="未找到这条签到记录" />}
  </AppScreen>;

  async function runAction(key: string, action: () => Promise<boolean | void>) {
    if (actionRunning.current) return;
    actionRunning.current = true; setActiveAction(key); setError('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { actionRunning.current = false; setActiveAction(null); }
  }

  const actionButton = (key: string, title: string, action: () => Promise<boolean | void>, variant: 'primary' | 'secondary' = 'primary') =>
    <PrimaryButton variant={variant} loading={activeAction === key} disabled={!!activeAction && activeAction !== key} onPress={() => { void runAction(key, action); }}>{title}</PrimaryButton>;

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
      const practice = isPracticeActivity(job!.activity);
      const session = await api.check(account.session, practice);
      await store.update(v => { const item = v.accounts.find(a => a.id === accountId); if (item) item.session = session; });
      const { mediaId } = await api.upload(session, await file.base64(), practice);
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
    catch (error) { if (store.get().jobs.find(j => j.id === id)?.photoUri !== staged) clearStagedPhoto(staged); throw error; }
  }

  const attempts = data.attempts.filter(a => a.jobId === id);

  return <AppScreen title="签到结果" subtitle={job.activity.title}
    backLabel="任务" onBack={() => router.back()}>
    {!!error && <YStack marginBottom={12}><FeedbackNotice message={error} tone="error" /></YStack>}
    <GroupedList>{attempts.map(attempt => {
      const account = data.accounts.find(a => a.id === attempt.accountId);
      const hasInlineActions = attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED' || attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE';
      return <YStack key={attempt.accountId}>
        <SettingsRow title={account?.label ?? '已删除账号'}
          last
          detail={attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED' ? attempt.message : undefined}
          accessory={<StatusBadge state={attempt.state} />} />
        {hasInlineActions && <YStack paddingHorizontal={16} paddingBottom={14} gap={8}>
          {(attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED') && actionButton(`retry-${attempt.accountId}`, '检查并重试', () => retryAttempt(store, id, attempt.accountId))}
          {attempt.state === 'FAILED' && job.input.kind === 'photo' && <>
            <XStack gap={8}>
              <YStack flex={1}>{actionButton(`photo-camera-${attempt.accountId}`, '拍照重试', () => providePhoto(attempt.accountId, true), 'secondary')}</YStack>
              <YStack flex={1}>{actionButton(`photo-library-${attempt.accountId}`, '选相册重试', () => providePhoto(attempt.accountId, false), 'secondary')}</YStack>
            </XStack>
            {!!data.settings.reservedPhotos.length && <PrimaryButton variant="secondary" disabled={!!activeAction} onPress={() => setReservedPickerAccountId(current => current === attempt.accountId ? null : attempt.accountId)}>
              {reservedPickerAccountId === attempt.accountId ? '收起预留照片' : '用预留照片重试'}
            </PrimaryButton>}
            {reservedPickerAccountId === attempt.accountId && <GroupedList>{data.settings.reservedPhotos.map((photo, photoIdx) =>
              <ReservedPhotoRow key={photo.id} photo={photo} index={photoIdx} last={photoIdx === data.settings.reservedPhotos.length - 1}
                onSelect={() => {
                  if (!reservedPhotoExists(photo.id)) { setError('该照片已丢失，请重新添加'); return; }
                  setReservedPickerAccountId(null);
                  void runAction(`photo-reserved-${attempt.accountId}`, () => retryWithPhoto(attempt.accountId, reservedPhotoUri(photo.id)));
                }} />)}</GroupedList>}
          </>}
          {attempt.state === 'WAITING_FACE' && <>
            <XStack gap={8}>
              <YStack flex={1}>{actionButton(`face-camera-${attempt.accountId}`, '拍照上传', () => provideFace(attempt.accountId, true), 'secondary')}</YStack>
              <YStack flex={1}>{actionButton(`face-library-${attempt.accountId}`, '选授权照片', () => provideFace(attempt.accountId, false), 'secondary')}</YStack>
            </XStack>
            {!!data.settings.reservedPhotos.length && <PrimaryButton variant="secondary" disabled={!!activeAction} onPress={() => setReservedPickerAccountId(current => current === attempt.accountId ? null : attempt.accountId)}>
              {reservedPickerAccountId === attempt.accountId ? '收起预留照片' : '用预留照片验证'}
            </PrimaryButton>}
            {reservedPickerAccountId === attempt.accountId && <GroupedList>{data.settings.reservedPhotos.map((photo, photoIdx) =>
              <ReservedPhotoRow key={photo.id} photo={photo} index={photoIdx} last={photoIdx === data.settings.reservedPhotos.length - 1}
                onSelect={() => {
                  if (!reservedPhotoExists(photo.id)) { setError('该照片已丢失，请重新添加'); return; }
                  setReservedPickerAccountId(null);
                  void runAction(`face-reserved-${attempt.accountId}`, () => provideFaceFromUri(attempt.accountId, reservedPhotoUri(photo.id)));
                }} />)}</GroupedList>}
          </>}
          {(attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE') && actionButton(`challenge-${attempt.accountId}`, '检查学习通签到结果', () => checkChallenge(store, id, attempt.accountId))}
        </YStack>}
      </YStack>;
    })}</GroupedList>
    {attempts.some(a => a.state === 'WAITING_QR') && <YStack marginTop={16} gap={8}>
      {isPracticeActivity(job.activity) && <PrimaryButton variant="secondary" disabled={!!activeAction} onPress={() => { void runAction('practice-qr', () => replaceQrAndResume(store, id, practiceQrPayload(job.activity.id), new Date().toISOString())); }}>使用演练二维码</PrimaryButton>}
      <PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } })}>重新扫码并继续</PrimaryButton>
    </YStack>}
    {job.state === 'RUNNING' && !executing && <YStack marginTop={16}>{actionButton('continue', '继续签到', () => runJob(store, job.id))}</YStack>}
  </AppScreen>;
}
