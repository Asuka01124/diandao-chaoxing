import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import type { LocationInput, SignInput } from '@sign/shared';
import { createJob, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { DEMO_QR_PAYLOAD, isDemoActivity } from '../../src/features/courses/demo-course';
import { GesturePatternPicker } from '../../src/features/courses/gesture-pattern-picker';
import { prepareErrorMessage } from '../../src/features/courses/prepare-error';
import { MapPicker } from '../../src/features/location/map-picker';
import { ReservedPhotoPicker } from '../../src/features/photos/reserved-photo-picker';
import { AppScreen, FeedbackNotice, GlassInput, GroupedList, HeroCard, Message, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function PrepareScreen() {
  const { id, accountId, selectedIds, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === accountId);
  const [selected, setSelected] = useState<string[]>(() => selectedIds ? selectedIds.split(',').filter(Boolean) : activity && isDemoActivity(activity) && accountId ? [accountId] : []);
  const [location, setLocation] = useState<LocationInput | null>(null); const [mapOpen, setMapOpen] = useState(false);
  const [code, setCode] = useState(''); const [gesture, setGesture] = useState(''); const [qr, setQr] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [demoQrAt, setDemoQrAt] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reservedPhotoId, setReservedPhotoId] = useState<string | null>(null);
  const [reservedPickerOpen, setReservedPickerOpen] = useState(false);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload) { setQr(qrPayload); setDemoQrAt(null); setError(''); } }, [qrPayload]);
  if (!data || !activity) return null;
  const demo = isDemoActivity(activity);
  function input(): SignInput {
    if (!activity) throw new Error('活动不存在');
    if ((activity.kind === 'location' || activity.requirements?.location) && !location) throw new Error('请先在地图上选择签到位置');
    if (activity.kind === 'click') return { kind: 'click' };
    if (activity.kind === 'location') return { kind: 'location', ...location! };
    if (activity.kind === 'code') {
      if (!/^\d{4,12}$/.test(code.trim())) throw new Error('请输入 4 至 12 位数字签到码。');
      return { kind: 'code', code: code.trim(), ...(location ? { location } : {}) };
    }
    if (activity.kind === 'gesture') {
      if (gesture.length < 4) throw new Error('请按顺序选择至少 4 个不同的圆点。');
      return { kind: 'gesture', sequence: gesture, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'qr') {
      const currentAt = demoQrAt ?? scannedAt;
      const currentPayload = demoQrAt ? DEMO_QR_PAYLOAD : qrPayload;
      if (!currentAt || qr !== currentPayload) throw new Error(demo ? '请先使用模拟二维码或扫描二维码' : '请先扫描当前活动的二维码');
      return { kind: 'qr', qrPayload: qr, scannedAt: currentAt, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'photo') return { kind: 'photo', mediaIdByAccount: {}, ...(location ? { location } : {}) };
    throw new Error('当前活动类型尚未接入安全提交');
  }
  async function pickPhoto(camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!picked.canceled) { setPhotoUri(picked.assets[0].uri); setReservedPhotoId(null); setError(''); notify('签到照片已选择', 'success'); }
    else notify('已取消选择照片', 'info');
  }
  async function start() {
    setBusy(true); setError('');
    let stagedUri: string | undefined;
    try {
      if (!activity) throw new Error('活动不存在');
      const prepared = input();
      if (prepared.kind === 'photo') {
        if (!photoUri) throw new Error('请先选择照片');
        if (reservedPhotoId && (!store.get().settings.reservedPhotos.some(photo => photo.id === reservedPhotoId) || !reservedPhotoExists(reservedPhotoId))) throw new Error('预留照片已不存在，请重新选择');
        stagedUri = await stagePhoto(photoUri);
      }
      const job = await createJob(store, activity, selected, prepared, stagedUri);
      stagedUri = undefined;
      notify(demo ? '演练已创建，不会提交学习通' : '任务已创建，正在执行', 'success');
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
      void runJob(store, job.id).catch(e => notify(e instanceof Error ? e.message : '任务执行失败，请查看结果', 'error'));
    }
    catch (e) { if (stagedUri) clearStagedPhoto(stagedUri); setError(prepareErrorMessage(e, activity?.kind ?? 'unknown')); }
    finally { setBusy(false); }
  }
  const needsLocation = activity.kind === 'location' || activity.requirements?.location;
  return <AppScreen title={demo ? '准备模拟签到' : '准备签到'} subtitle={activity.title} footer={<YStack gap={8}>
    {!!error && <FeedbackNotice message={error} tone="error" />}
    {!selected.length && <Message>请先选择至少一个账号</Message>}
    <PrimaryButton onPress={() => { void start(); }} loading={busy} disabled={!selected.length || activity.kind === 'unknown'}>{`为 ${selected.length} 个账号${demo ? '演练' : '签到'}`}</PrimaryButton>
  </YStack>}>
    <HeroCard eyebrow={demo ? '本机模拟' : '签到准备'} title={`${selected.length} 个账号已选择`} detail={demo ? '可检查选账号、填写信息和查看任务结果；不会向学习通提交。' : '确认参与账号，再补充本次签到要求的信息。'} />
    <SectionTitle>选择账号</SectionTitle><GroupedList>{data.accounts.map(a => <SettingsRow key={a.id} title={a.label} detail={a.role === 'primary' ? '我的账号' : undefined} onPress={() => { setError(''); setSelected(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids, a.id]); }} accessory={<Text color="$brand" fontSize={20}>{selected.includes(a.id) ? '✓' : '○'}</Text>} />)}</GroupedList>
    {needsLocation && <><SectionTitle>签到位置</SectionTitle><GroupedList><SettingsRow title={location?.address ?? '尚未选择位置'} detail={location ? '点击可在地图上重新选点' : '点击打开地图，选择签到地点'} symbol="⌖" onPress={() => setMapOpen(true)} /></GroupedList></>}
    {needsLocation && !!data.settings.favoriteLocations.length && <><SectionTitle>收藏位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.map((item, index) => <SettingsRow key={index} title={item.address} detail="点击使用此位置" selected={location?.latitude === item.latitude && location?.longitude === item.longitude} onPress={() => { setLocation(item); setError(''); notify('已选用收藏位置', 'success'); }} />)}</GroupedList></>}
    <MapPicker visible={mapOpen} initial={location} onClose={() => setMapOpen(false)} onPick={point => { setLocation(point); setError(''); notify('签到位置已选择', 'success'); }} />
    {activity.kind === 'code' && <><SectionTitle>签到码</SectionTitle><GlassInput placeholder="请输入数字签到码" value={code} onChangeText={value => { setCode(value); setError(''); }} keyboardType="number-pad" /></>}
    {activity.kind === 'gesture' && <><SectionTitle>手势签到</SectionTitle><GesturePatternPicker value={gesture} onChange={value => { setGesture(value); setError(''); }} /></>}
    {activity.kind === 'qr' && <><SectionTitle>二维码</SectionTitle><YStack gap={10}><Message>{demoQrAt ? '已填入模拟二维码' : scannedAt && qr === qrPayload ? `已于 ${new Date(scannedAt).toLocaleTimeString()} 扫描` : demo ? '可使用模拟二维码，也可打开相机练习扫码' : '请扫描当前活动的二维码'}</Message>
      {demo && <PrimaryButton onPress={() => { setQr(DEMO_QR_PAYLOAD); setDemoQrAt(new Date().toISOString()); setError(''); notify('模拟二维码已填入', 'success'); }}>使用模拟二维码</PrimaryButton>}
      <PrimaryButton onPress={() => router.push({ pathname: '/scan', params: { id: activity.id, accountId, selectedIds: selected.join(',') } })}>打开扫码</PrimaryButton></YStack></>}
    {activity.kind === 'photo' && <><SectionTitle>签到照片</SectionTitle><YStack gap={12}>
      <Message>{photoUri ? demo ? '已选择照片；演练只在本机处理，不会上传' : '已选择照片，确认后将按账号分别上传' : '使用预留照片，或直接拍摄本次照片'}</Message>
      {photoUri && <Image source={{ uri: photoUri }} resizeMode="cover" accessibilityLabel="当前选择的签到照片预览" style={{ width: '100%', height: 170, borderRadius: 16 }} />}
      {data.settings.reservedPhotos.length ? <PrimaryButton onPress={() => setReservedPickerOpen(true)}>{`使用预留照片（${data.settings.reservedPhotos.length}）`}</PrimaryButton>
        : <Message>暂无预留照片，可先在设置中添加，最多 10 张。</Message>}
      <PrimaryButton onPress={() => { void pickPhoto(true).catch(e => setError(prepareErrorMessage(e, 'photo'))); }}>直接拍照</PrimaryButton>
      <PrimaryButton onPress={() => { void pickPhoto(false).catch(e => setError(prepareErrorMessage(e, 'photo'))); }}>从相册选择</PrimaryButton>
    </YStack><ReservedPhotoPicker visible={reservedPickerOpen} photos={data.settings.reservedPhotos} selectedId={reservedPhotoId}
      onClose={() => setReservedPickerOpen(false)} onPick={photo => {
        if (!reservedPhotoExists(photo.id)) { notify('这张预留照片已丢失，请在设置中删除后重新添加', 'error'); return; }
        setReservedPhotoId(photo.id); setPhotoUri(reservedPhotoUri(photo.id)); setReservedPickerOpen(false); setError(''); notify('预留照片已选择', 'success');
      }} /></>}
  </AppScreen>;
}
