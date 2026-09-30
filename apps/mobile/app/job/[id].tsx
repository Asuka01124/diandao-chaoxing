import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { api } from '../../src/core/api';
import { checkChallenge, provideFaceAndResume, replacePhotoAndRetry, replaceQrAndResume, retryAttempt, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { AppScreen, GroupedList, HeroCard, Message, PrimaryButton, SectionTitle, SettingsRow, StatusBadge } from '../../src/ui';

export default function JobScreen() {
  const { id, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const [error, setError] = useState('');
  useEffect(() => { if (!data) router.replace('/'); }, [!!data]);
  useEffect(() => { if (qrPayload && scannedAt && id) void replaceQrAndResume(store, id, qrPayload, scannedAt).catch(e => setError(e instanceof Error ? e.message : '更新二维码失败')); }, [qrPayload, scannedAt]);
  if (!data) return null; const job = data.jobs.find(j => j.id === id); if (!job) return null;
  async function provideFace(accountId: string, camera: boolean) {
    const account = store.get().accounts.find(a => a.id === accountId); if (!account) throw new Error('账号已删除');
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (picked.canceled) return;
    const source = picked.assets[0].uri;
    const converted = await ImageManipulator.manipulateAsync(source, [], { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG });
    const file = new File(converted.uri);
    try {
      const session = await api.check(account.session);
      await store.update(v => { const item = v.accounts.find(a => a.id === accountId); if (item) item.session = session; });
      const { mediaId } = await api.upload(session, await file.base64());
      await provideFaceAndResume(store, id, accountId, mediaId);
    } finally { if (file.exists) file.delete(); if (source.startsWith(Paths.cache.uri)) { const original = new File(source); if (original.exists) original.delete(); } }
  }
  async function providePhoto(accountId: string, camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (picked.canceled) return;
    const staged = await stagePhoto(picked.assets[0].uri);
    try { await replacePhotoAndRetry(store, id, accountId, staged); }
    catch (error) { if (store.get().jobs.find(j => j.id === id)?.photoUri !== staged) clearStagedPhoto(staged); throw error; }
  }
  const attempts = data.attempts.filter(a => a.jobId === id);
  return <AppScreen title="任务结果" subtitle={job.activity.title}>
    <HeroCard eyebrow="执行状态" title={job.state === 'DONE' ? '任务已完成' : job.state === 'WAITING' ? '等待你的输入' : '正在逐账号执行'} detail="下方显示每个账号的实际结果，失败的账号可以单独核查和重试。" />
    <SectionTitle>逐账号状态</SectionTitle><GroupedList>{attempts.map(attempt => {
      const account = data.accounts.find(a => a.id === attempt.accountId);
      return <YStack key={attempt.accountId}><SettingsRow title={account?.label ?? '已删除账号'} detail={`${attempt.message ?? ''}${attempt.count ? ` · 提交 ${attempt.count} 次` : ''}`} accessory={<StatusBadge state={attempt.state} />} />
        {(attempt.state === 'FAILED' || attempt.state === 'REAUTH_REQUIRED') && <YStack padding={12}><PrimaryButton onPress={() => { void retryAttempt(store, id, attempt.accountId).catch(e => setError(e instanceof Error ? e.message : '重试失败')); }}>核查后重试</PrimaryButton></YStack>}
        {attempt.state === 'FAILED' && job.input.kind === 'photo' && <YStack padding={12} gap={8}><PrimaryButton onPress={() => { void providePhoto(attempt.accountId, true).catch(e => setError(e instanceof Error ? e.message : '换图失败')); }}>拍摄新照片并重试</PrimaryButton><PrimaryButton onPress={() => { void providePhoto(attempt.accountId, false).catch(e => setError(e instanceof Error ? e.message : '换图失败')); }}>选择新照片并重试</PrimaryButton></YStack>}
        {(attempt.state === 'WAITING_CAPTCHA' || attempt.state === 'WAITING_FACE') && <YStack padding={12}><PrimaryButton onPress={() => { void checkChallenge(store, id, attempt.accountId).catch(e => setError(e instanceof Error ? e.message : '核查失败')); }}>已在官方客户端验证，核查结果</PrimaryButton></YStack>}
        {attempt.state === 'WAITING_FACE' && <YStack padding={12} gap={8}><PrimaryButton onPress={() => { void provideFace(attempt.accountId, true).catch(e => setError(e instanceof Error ? e.message : '人脸校验失败')); }}>拍摄该账号人脸照片</PrimaryButton><PrimaryButton onPress={() => { void provideFace(attempt.accountId, false).catch(e => setError(e instanceof Error ? e.message : '人脸校验失败')); }}>选择该账号授权照片</PrimaryButton></YStack>}
      </YStack>;
    })}</GroupedList>
    {attempts.some(a => a.state === 'WAITING_QR') && <YStack marginTop={20}><PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: job.activity.id, jobId: job.id } })}>扫描新二维码并继续</PrimaryButton></YStack>}
    {attempts.some(a => a.state === 'WAITING_CAPTCHA' || a.state === 'WAITING_FACE') && <Message>第三方要求人工验证。可以在此提供该账号授权的人脸照片，或在官方客户端完成验证后核查状态。</Message>}
    {job.state === 'RUNNING' && <YStack marginTop={20}><PrimaryButton onPress={() => { void runJob(store, job.id); }}>继续未完成账号</PrimaryButton></YStack>}
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
