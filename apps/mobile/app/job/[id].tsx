import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { api } from '../../src/core/api';
import { jobResult } from '../../src/core/job-result';
import { checkChallenge, provideFaceAndResume, replacePhotoAndRetry, replaceQrAndResume, retryAttempt, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { ReservedPhotoRow } from '../../src/features/photos/reserved-photo-row';
import { AppScreen, FeedbackNotice, GroupedList, Message, PrimaryButton, SectionTitle, SettingsRow, StatusBadge, useFeedback } from '../../src/ui';

export default function JobScreen() {
  const { id, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const [error, setError] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [reservedPickerAccountId, setReservedPickerAccountId] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload && scannedAt && id) {
    notify('正在检查新二维码…', 'loading');
    void replaceQrAndResume(store, id, qrPayload, scannedAt).then(() => notify('二维码已更新', 'success')).catch(e => { const message = e instanceof Error ? e.message : '更新二维码失败'; setError(message); notify(message, 'error'); });
  } }, [qrPayload, scannedAt]);
  if (!data) return null; const job = data.jobs.find(j => j.id === id); if (!job) return null;

  async function runAction(key: string, progress: string, action: () => Promise<boolean | void>, accountId?: string) {
    if (actionRunning.current) return;
    actionRunning.current = true; setActiveAction(key); setError(''); notify(progress, 'loading');
    try {
      if (await action() === false) { notify('已取消', 'info'); return; }
      const attempt = accountId ? store.get().attempts.find(item => item.jobId === id && item.accountId === accountId) : undefined;
      if (attempt?.state === 'SUCCESS' || attempt?.state === 'ALREADY_SIGNED') notify('该账号已签到', 'success');
      else if (attempt?.state === 'FAILED' || attempt?.state === 'REAUTH_REQUIRED') notify(attempt.message || '仍未完成，请查看结果', 'error');
      else if (attempt?.state?.startsWith('WAITING_')) notify('仍需完成验证', 'info');
      else notify('状态已更新', 'info');
    } catch (e) { const message = e instanceof Error ? e.message : '操作失败，请重试'; setError(message); notify(message, 'error'); }
    finally { actionRunning.current = false; setActiveAction(null); }
  }

  const actionButton = (key: string, title: string, progress: string, action: () => Promise<boolean | void>, accountId?: string, variant: 'primary' | 'secondary' = 'primary') =>
    <PrimaryButton variant={variant} loading={activeAction === key} disabled={!!activeAction && activeAction !== key} onPress={() => { void runAction(key, progress, action, accountId); }}>{title}</PrimaryButton>;

  async function provideFace(accountId: string, camera: boolean) {
    const account = store.get().accounts.find(a => a.id === accountId); if (!account) throw new Error('账号已删除');
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (picked.canceled) return false;
    const source = picked.assets[0].uri;
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
    catch (error) { if (store.get().jobs.find(j => j.id === id)?.photoUri !== staged) clearStagedPhoto(staged); throw error; }
  }

  const attempts = data.attempts.filter(a => a.jobId === id);
  const result = jobResult(job, attempts);
  const headerPillBg = result.success ? '$ongoingHeader' : result.needsAttention ? '$dangerSoft' : '$soft';
  const headerPillFg = result.success ? '$success' : result.needsAttention ? '$danger' : '$muted';

  return <AppScreen title={result.title} subtitle={`${job.activity.title} · ${result.detail}`}
    backLabel="任务" onBack={() => router.back()}
    headerAction={<YStack backgroundColor={headerPillBg} paddingHorizontal={10} paddingVertical={5} borderRadius={999}>
      <Text color={headerPillFg} fontSize={12} fontWeight="500">{result.success ? '已完成' : result.needsAttention ? '待处理' : '进行中'}</Text>
    </YStack>}>
    {!!error && <YStack marginBottom={12}><FeedbackNotice message={error} tone="error" /></YStack>}
    <SectionTitle meta={String(attempts.length).padStart(2, '0')}>各账号结果</SectionTitle>
    <GroupedList>{attempts.map((attempt, index) => {
      const account = data.accounts.find(a => a.id === attempt.accountId);
      const hasInlineActions = attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED' || attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE';
      return <YStack key={attempt.accountId} borderBottomWidth={index === attempts.length - 1 ? 0 : 0.7} borderColor="$separator">
        <SettingsRow title={account?.label ?? '已删除账号'} indexLabel={String(index + 1).padStart(2, '0')}
          last
          detail={`${attempt.message ?? ''}${attempt.count ? ` · 提交 ${attempt.count} 次` : ''}`}
          accessory={<StatusBadge state={attempt.state} />} />
        {hasInlineActions && <YStack paddingHorizontal={16} paddingBottom={14} gap={8}>
          {(attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED') && actionButton(`retry-${attempt.accountId}`, '检查并重试', '正在检查并重试…', () => retryAttempt(store, id, attempt.accountId), attempt.accountId)}
          {attempt.state === 'FAILED' && job.input.kind === 'photo' && <>
            <XStack gap={8}>
              <YStack flex={1}>{actionButton(`photo-camera-${attempt.accountId}`, '拍照重试', '正在处理照片…', () => providePhoto(attempt.accountId, true), attempt.accountId, 'secondary')}</YStack>
              <YStack flex={1}>{actionButton(`photo-library-${attempt.accountId}`, '选相册重试', '正在处理照片…', () => providePhoto(attempt.accountId, false), attempt.accountId, 'secondary')}</YStack>
            </XStack>
            {!!data.settings.reservedPhotos.length && <PrimaryButton variant="secondary" disabled={!!activeAction} onPress={() => setReservedPickerAccountId(current => current === attempt.accountId ? null : attempt.accountId)}>
              {reservedPickerAccountId === attempt.accountId ? '收起预留照片' : '用预留照片重试'}
            </PrimaryButton>}
            {reservedPickerAccountId === attempt.accountId && <GroupedList>{data.settings.reservedPhotos.map((photo, photoIdx) =>
              <ReservedPhotoRow key={photo.id} photo={photo} index={photoIdx} last={photoIdx === data.settings.reservedPhotos.length - 1}
                detail="点击使用这张照片重试" onSelect={() => {
                  if (!reservedPhotoExists(photo.id)) { notify('该照片已丢失，请重新添加', 'error'); return; }
                  setReservedPickerAccountId(null);
                  void runAction(`photo-reserved-${attempt.accountId}`, '正在处理预留照片…', () => retryWithPhoto(attempt.accountId, reservedPhotoUri(photo.id)), attempt.accountId);
                }} />)}</GroupedList>}
          </>}
          {attempt.state === 'WAITING_FACE' && <XStack gap={8}>
            <YStack flex={1}>{actionButton(`face-camera-${attempt.accountId}`, '拍照上传', '正在上传并验证…', () => provideFace(attempt.accountId, true), attempt.accountId, 'secondary')}</YStack>
            <YStack flex={1}>{actionButton(`face-library-${attempt.accountId}`, '选授权照片', '正在上传并验证…', () => provideFace(attempt.accountId, false), attempt.accountId, 'secondary')}</YStack>
          </XStack>}
          {(attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE') && actionButton(`challenge-${attempt.accountId}`, '已在学习通验证，检查结果', '正在检查验证结果…', () => checkChallenge(store, id, attempt.accountId), attempt.accountId)}
        </YStack>}
      </YStack>;
    })}</GroupedList>
    {attempts.some(a => a.state === 'WAITING_QR') && <YStack marginTop={16}><PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } })}>重新扫码并继续</PrimaryButton></YStack>}
    {attempts.some(a => a.state === 'WAITING_CAPTCHA' || a.state === 'WAITING_FACE') && <YStack marginTop={12}><Message>验证码请在学习通中完成；人脸验证可上传本人授权照片或在学习通中完成，随后点击“检查结果”。</Message></YStack>}
    {job.state === 'RUNNING' && <YStack marginTop={16}>{actionButton('continue', '继续签到', '正在继续签到…', () => runJob(store, job.id))}</YStack>}
  </AppScreen>;
}
