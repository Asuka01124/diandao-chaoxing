import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Input, Text, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import type { SignInput } from '@sign/shared';
import { createJob, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { AppScreen, GroupedList, HeroCard, Message, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function PrepareScreen() {
  const { id, accountId, selectedIds, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === accountId);
  const [selected, setSelected] = useState<string[]>(() => selectedIds ? selectedIds.split(',').filter(Boolean) : accountId ? [accountId] : []); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState(''); const [address, setAddress] = useState('');
  const [code, setCode] = useState(''); const [gesture, setGesture] = useState(''); const [qr, setQr] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  useEffect(() => { if (store.ready && !data?.accounts.length) router.replace('/'); }, [store.ready, data?.accounts.length]);
  useEffect(() => { if (qrPayload) setQr(qrPayload); }, [qrPayload]);
  if (!data || !activity) return null;
  function input(): SignInput {
    if (!activity) throw new Error('活动不存在');
    const location = { latitude: Number(latitude), longitude: Number(longitude), address: address.trim() };
    if (activity.kind === 'click') return { kind: 'click' };
    if (activity.kind === 'location') return { kind: 'location', ...location };
    if (activity.kind === 'code') return { kind: 'code', code: code.trim(), ...(address ? { location } : {}) };
    if (activity.kind === 'gesture') return { kind: 'gesture', sequence: gesture.trim(), ...(address ? { location } : {}) };
    if (activity.kind === 'qr') {
      if (!scannedAt || qr !== qrPayload) throw new Error('请先扫描当前活动的二维码');
      return { kind: 'qr', qrPayload: qr, scannedAt, ...(address ? { location } : {}) };
    }
    if (activity.kind === 'photo') return { kind: 'photo', mediaIdByAccount: {}, ...(address ? { location } : {}) };
    throw new Error('当前活动类型尚未接入安全提交');
  }
  async function pickPhoto(camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!picked.canceled) setPhotoUri(picked.assets[0].uri);
  }
  async function start() {
    setBusy(true); setError('');
    let stagedUri: string | undefined;
    try {
      if (!activity) throw new Error('活动不存在');
      const prepared = input();
      if (prepared.kind === 'photo') {
        if (!photoUri) throw new Error('请先选择照片');
        stagedUri = await stagePhoto(photoUri);
      }
      const job = await createJob(store, activity, selected, prepared, stagedUri);
      stagedUri = undefined;
      router.replace({ pathname: '/job/[id]', params: { id: job.id } }); void runJob(store, job.id);
    }
    catch (e) { if (stagedUri) clearStagedPhoto(stagedUri); setError(e instanceof Error ? e.message : '创建任务失败'); }
    finally { setBusy(false); }
  }
  const needsLocation = activity.kind === 'location' || activity.requirements?.location;
  return <AppScreen title="准备签到" subtitle={activity.title} footer={<PrimaryButton onPress={() => { void start(); }} disabled={busy || !selected.length || activity.kind === 'unknown'}>{busy ? '正在准备…' : '确认并逐账号签到'}</PrimaryButton>}>
    <HeroCard eyebrow="确认签到" title={`${selected.length} 个账号已选择`} detail="确认账号名单和输入后，应用会逐账号执行并展示各自的结果。" />
    <SectionTitle>账号名单</SectionTitle><GroupedList>{data.accounts.map(a => <SettingsRow key={a.id} title={a.label} detail={a.session.identifier} onPress={() => setSelected(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids, a.id])} accessory={<Text color="$brand" fontSize={20}>{selected.includes(a.id) ? '✓' : '○'}</Text>} />)}</GroupedList>
    {needsLocation && <><SectionTitle>签到位置</SectionTitle><YStack backgroundColor="$panel" borderRadius="$panel" padding={16} gap={10}><Input placeholder="纬度" keyboardType="decimal-pad" value={latitude} onChangeText={setLatitude} /><Input placeholder="经度" keyboardType="decimal-pad" value={longitude} onChangeText={setLongitude} /><Input placeholder="详细地址" value={address} onChangeText={setAddress} /></YStack></>}
    {needsLocation && !!data.settings.favoriteLocations.length && <><SectionTitle>收藏位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.map((location, index) => <SettingsRow key={index} title={location.address} detail={`${location.latitude}, ${location.longitude}`} onPress={() => { setLatitude(String(location.latitude)); setLongitude(String(location.longitude)); setAddress(location.address); }} />)}</GroupedList></>}
    {activity.kind === 'code' && <><SectionTitle>签到码</SectionTitle><Input placeholder="请输入数字签到码" value={code} onChangeText={setCode} keyboardType="number-pad" /></>}
    {activity.kind === 'gesture' && <><SectionTitle>手势顺序</SectionTitle><Input placeholder="按 1–9 顺序输入不重复数字" value={gesture} onChangeText={setGesture} keyboardType="number-pad" /></>}
    {activity.kind === 'qr' && <><SectionTitle>二维码</SectionTitle><YStack gap={10}><Message>{scannedAt && qr === qrPayload ? `已于 ${new Date(scannedAt).toLocaleTimeString()} 扫描` : '请扫描当前活动的二维码'}</Message><PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: activity.id, accountId, selectedIds: selected.join(',') } })}>打开扫码</PrimaryButton></YStack></>}
    {activity.kind === 'photo' && <><SectionTitle>签到照片</SectionTitle><YStack gap={10}><Message>{photoUri ? '已选择照片，确认后将按账号分别上传' : '请选择或拍摄签到照片'}</Message><PrimaryButton onPress={() => { void pickPhoto(false).catch(e => setError(e instanceof Error ? e.message : '选图失败')); }}>从相册选择</PrimaryButton><PrimaryButton onPress={() => { void pickPhoto(true).catch(e => setError(e instanceof Error ? e.message : '拍摄失败')); }}>拍摄照片</PrimaryButton></YStack></>}
    <SectionTitle>确认输入</SectionTitle><GroupedList><SettingsRow title="账号数" detail={String(selected.length)} /><SettingsRow title="活动类型" detail={activity.kind} />{needsLocation && <SettingsRow title="最终位置" detail={`${address || '未填写'} (${latitude || '—'}, ${longitude || '—'})`} />}</GroupedList>
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
