import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { api } from '../../src/core/api';
import { checkChallenge, provideFaceAndResume, replacePhotoAndRetry, replaceQrAndResume, retryAttempt, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { isDemoActivity } from '../../src/features/courses/demo-course';
import { ReservedPhotoPicker } from '../../src/features/photos/reserved-photo-picker';
import { AppScreen, FeedbackNotice, GroupedList, HeroCard, Message, PrimaryButton, SectionTitle, SettingsRow, StatusBadge, useFeedback } from '../../src/ui';

export default function JobScreen() {
  const { id, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const [error, setError] = useState('');
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [reservedPickerAccountId, setReservedPickerAccountId] = useState<string | null>(null);
  const actionRunning = useRef(false);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload && scannedAt && id) {
    notify('正在核查新二维码…', 'loading');
    void replaceQrAndResume(store, id, qrPayload, scannedAt).then(() => notify('二维码已更新，请查看账号结果', 'success')).catch(e => { const message = e instanceof Error ? e.message : '更新二维码失败'; setError(message); notify(message, 'error'); });
  } }, [qrPayload, scannedAt]);
  if (!data) return null; const job = data.jobs.find(j => j.id === id); if (!job) return null;
  const demo = isDemoActivity(job.activity);
  async function runAction(key: string, progress: string, action: () => Promise<boolean | void>, accountId?: string) {
    if (actionRunning.current) return;
    actionRunning.current = true; setActiveAction(key); setError(''); notify(progress, 'loading');
    try {
      if (await action() === false) { notify('已取消选择', 'info'); return; }
      const attempt = accountId ? store.get().attempts.find(item => item.jobId === id && item.accountId === accountId) : undefined;
      if (attempt?.state === 'SUCCESS' || attempt?.state === 'ALREADY_SIGNED') notify(demo ? '本机演练通过' : '该账号已签到', 'success');
      else if (attempt?.state === 'FAILED' || attempt?.state === 'REAUTH_REQUIRED') notify(attempt.message || '该账号仍未完成，请查看结果', 'error');
      else if (attempt?.state?.startsWith('WAITING_')) notify('还需要完成验证，请查看账号状态', 'info');
      else if (accountId) notify('账号状态已更新，请查看结果', 'info');
      else notify('执行结束，请查看逐账号结果', 'info');
    } catch (e) { const message = e instanceof Error ? e.message : '操作失败，请重试'; setError(message); notify(message, 'error'); }
    finally { actionRunning.current = false; setActiveAction(null); }
  }
  const actionButton = (key: string, title: string, progress: string, action: () => Promise<boolean | void>, accountId?: string) =>
    <PrimaryButton loading={activeAction === key} disabled={!!activeAction && activeAction !== key} onPress={() => { void runAction(key, progress, action, accountId); }}>{title}</PrimaryButton>;
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
  return <AppScreen title={demo ? '演练结果' : '任务结果'} subtitle={job.activity.title}>
    {!!error && <FeedbackNotice message={error} tone="error" />}
    <HeroCard eyebrow={demo ? '本机模拟' : '执行状态'} title={demo ? job.state === 'DONE' ? '演练已完成' : '正在演练' : job.state === 'DONE' ? '任务已完成' : job.state === 'WAITING' ? '等待你的输入' : '正在逐账号执行'} detail={demo ? '下方是模拟结果。没有向学习通提交，也没有产生真实签到记录。' : '下方显示每个账号的实际结果，失败的账号可以单独核查和重试。'} />
    <SectionTitle>逐账号状态</SectionTitle><GroupedList>{attempts.map(attempt => {
      const account = data.accounts.find(a => a.id === attempt.accountId);
      return <YStack key={attempt.accountId}><SettingsRow title={account?.label ?? '已删除账号'} detail={`${attempt.message ?? ''}${attempt.count ? ` · ${demo ? '模拟' : '提交'} ${attempt.count} 次` : ''}`} accessory={<StatusBadge state={attempt.state} />} />
        {(attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED') && <YStack padding={12}>{actionButton(`retry-${attempt.accountId}`, '核查后重试', '正在核查并重试…', () => retryAttempt(store, id, attempt.accountId), attempt.accountId)}</YStack>}
        {attempt.state === 'FAILED' && job.input.kind === 'photo' && <YStack padding={12} gap={8}>
          {!!data.settings.reservedPhotos.length && <PrimaryButton disabled={!!activeAction} onPress={() => setReservedPickerAccountId(attempt.accountId)}>使用预留照片并重试</PrimaryButton>}
          {actionButton(`photo-camera-${attempt.accountId}`, '拍摄新照片并重试', '正在处理照片…', () => providePhoto(attempt.accountId, true), attempt.accountId)}
          {actionButton(`photo-library-${attempt.accountId}`, '选择新照片并重试', '正在处理照片…', () => providePhoto(attempt.accountId, false), attempt.accountId)}
        </YStack>}
        {(attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE') && <YStack padding={12}>{actionButton(`challenge-${attempt.accountId}`, '已在官方客户端验证，核查结果', '正在核查验证结果…', () => checkChallenge(store, id, attempt.accountId), attempt.accountId)}</YStack>}
        {attempt.state === 'WAITING_FACE' && <YStack padding={12} gap={8}>
          {actionButton(`face-camera-${attempt.accountId}`, '拍摄该账号人脸照片', '正在上传并核查照片…', () => provideFace(attempt.accountId, true), attempt.accountId)}
          {actionButton(`face-library-${attempt.accountId}`, '选择该账号授权照片', '正在上传并核查照片…', () => provideFace(attempt.accountId, false), attempt.accountId)}
        </YStack>}
      </YStack>;
    })}</GroupedList>
    {attempts.some(a => a.state === 'WAITING_QR') && <YStack marginTop={20}><PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } })}>扫描新二维码并继续</PrimaryButton></YStack>}
    {attempts.some(a => a.state === 'WAITING_CAPTCHA' || a.state === 'WAITING_FACE') && <Message>第三方要求人工验证。可以在此提供该账号授权的人脸照片，或在官方客户端完成验证后核查状态。</Message>}
    {job.state === 'RUNNING' && <YStack marginTop={20}>{actionButton('continue', '继续未完成账号', '正在继续执行任务…', () => runJob(store, job.id))}</YStack>}
    {demo && job.state === 'DONE' && <YStack marginTop={20}><PrimaryButton onPress={() => router.push({ pathname: '/prepare/[id]', params: { id: job.activity.id, accountId: data.accounts.find(a => a.role === 'primary')?.id } })}>再演练一次</PrimaryButton></YStack>}
    <ReservedPhotoPicker visible={!!reservedPickerAccountId} photos={data.settings.reservedPhotos} onClose={() => setReservedPickerAccountId(null)} onPick={photo => {
      if (!reservedPickerAccountId) return;
      if (!reservedPhotoExists(photo.id)) { notify('这张预留照片已丢失，请在设置中删除后重新添加', 'error'); return; }
      const accountId = reservedPickerAccountId;
      setReservedPickerAccountId(null);
      void runAction(`photo-reserved-${accountId}`, '正在处理预留照片…', () => retryWithPhoto(accountId, reservedPhotoUri(photo.id)), accountId);
    }} />
  </AppScreen>;
}
