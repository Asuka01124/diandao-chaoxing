import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Input, Text, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import type { LocationInput, SignInput } from '@sign/shared';
import { createJob, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { MapPicker } from '../../src/features/location/map-picker';
import { AppScreen, FeedbackNotice, GroupedList, Message, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function PrepareScreen() {
  const { id, accountId, selectedIds, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === accountId);
  const [selected, setSelected] = useState<string[]>(() => selectedIds ? selectedIds.split(',').filter(Boolean) : []);
  const [location, setLocation] = useState<LocationInput | null>(null); const [mapOpen, setMapOpen] = useState(false);
  const [code, setCode] = useState(''); const [gesture, setGesture] = useState(''); const [qr, setQr] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload) setQr(qrPayload); }, [qrPayload]);
  if (!data || !activity) return null;
  function input(): SignInput {
    if (!activity) throw new Error('活动不存在');
    if ((activity.kind === 'location' || activity.requirements?.location) && !location) throw new Error('请先在地图上选择签到位置');
    if (activity.kind === 'click') return { kind: 'click' };
    if (activity.kind === 'location') return { kind: 'location', ...location! };
    if (activity.kind === 'code') return { kind: 'code', code: code.trim(), ...(location ? { location } : {}) };
    if (activity.kind === 'gesture') return { kind: 'gesture', sequence: gesture.trim(), ...(location ? { location } : {}) };
    if (activity.kind === 'qr') {
      if (!scannedAt || qr !== qrPayload) throw new Error('请先扫描当前活动的二维码');
      return { kind: 'qr', qrPayload: qr, scannedAt, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'photo') return { kind: 'photo', mediaIdByAccount: {}, ...(location ? { location } : {}) };
    throw new Error('当前活动类型尚未接入安全提交');
  }
  async function pickPhoto(camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!picked.canceled) { setPhotoUri(picked.assets[0].uri); notify('签到照片已选择', 'success'); }
    else notify('已取消选择照片', 'info');
  }
  async function start() {
    setBusy(true); setError('');
    notify('正在准备签到任务…', 'loading');
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
      notify('任务已创建，正在执行', 'success');
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
      void runJob(store, job.id).catch(e => notify(e instanceof Error ? e.message : '任务执行失败，请查看结果', 'error'));
    }
    catch (e) { if (stagedUri) clearStagedPhoto(stagedUri); const message = e instanceof Error ? e.message : '创建任务失败'; setError(message); notify(message, 'error'); }
    finally { setBusy(false); }
  }
  const needsLocation = activity.kind === 'location' || activity.requirements?.location;
  return <AppScreen title="准备签到" subtitle={activity.title} footer={<YStack gap={8}>
    {!selected.length && <Message>请先选择至少一个账号</Message>}
    <PrimaryButton onPress={() => { void start(); }} loading={busy} disabled={!selected.length || activity.kind === 'unknown'}>为 {selected.length} 个账号签到</PrimaryButton>
  </YStack>}>
    {!!error && <FeedbackNotice message={error} tone="error" />}
    <SectionTitle>选择账号</SectionTitle><GroupedList>{data.accounts.map(a => <SettingsRow key={a.id} title={a.label} detail={a.role === 'primary' ? '我的账号' : undefined} onPress={() => setSelected(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids, a.id])} accessory={<Text color="$brand" fontSize={20}>{selected.includes(a.id) ? '✓' : '○'}</Text>} />)}</GroupedList>
    {needsLocation && <><SectionTitle>签到位置</SectionTitle><GroupedList><SettingsRow title={location?.address ?? '尚未选择位置'} detail={location ? '点击可在地图上重新选点' : '点击打开地图，选择签到地点'} symbol="⌖" onPress={() => setMapOpen(true)} /></GroupedList></>}
    {needsLocation && !!data.settings.favoriteLocations.length && <><SectionTitle>收藏位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.map((item, index) => <SettingsRow key={index} title={item.address} detail="点击使用此位置" selected={location?.latitude === item.latitude && location?.longitude === item.longitude} onPress={() => { setLocation(item); notify('已选用收藏位置', 'success'); }} />)}</GroupedList></>}
    <MapPicker visible={mapOpen} initial={location} onClose={() => setMapOpen(false)} onPick={point => { setLocation(point); notify('签到位置已选择', 'success'); }} />
    {activity.kind === 'code' && <><SectionTitle>签到码</SectionTitle><Input placeholder="请输入数字签到码" value={code} onChangeText={setCode} keyboardType="number-pad" /></>}
    {activity.kind === 'gesture' && <><SectionTitle>手势顺序</SectionTitle><Input placeholder="按 1–9 顺序输入不重复数字" value={gesture} onChangeText={setGesture} keyboardType="number-pad" /></>}
    {activity.kind === 'qr' && <><SectionTitle>二维码</SectionTitle><YStack gap={10}><Message>{scannedAt && qr === qrPayload ? `已于 ${new Date(scannedAt).toLocaleTimeString()} 扫描` : '请扫描当前活动的二维码'}</Message><PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: activity.id, accountId, selectedIds: selected.join(',') } })}>打开扫码</PrimaryButton></YStack></>}
    {activity.kind === 'photo' && <><SectionTitle>签到照片</SectionTitle><YStack gap={10}><Message>{photoUri ? '已选择照片，确认后将按账号分别上传' : '请选择或拍摄签到照片'}</Message><PrimaryButton onPress={() => { void pickPhoto(false).catch(e => { const message = e instanceof Error ? e.message : '选图失败'; setError(message); notify(message, 'error'); }); }}>从相册选择</PrimaryButton><PrimaryButton onPress={() => { void pickPhoto(true).catch(e => { const message = e instanceof Error ? e.message : '拍摄失败'; setError(message); notify(message, 'error'); }); }}>拍摄照片</PrimaryButton></YStack></>}
  </AppScreen>;
}
