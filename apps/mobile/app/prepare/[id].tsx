import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import type { LocationInput, SignInput } from '@sign/shared';
import { createJob, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount, primaryAccount } from '../../src/features/accounts/account-role';
import { GesturePatternPicker } from '../../src/features/courses/gesture-pattern-picker';
import { prepareErrorMessage } from '../../src/features/courses/prepare-error';
import { MapPicker } from '../../src/features/location/map-picker';
import { photoName } from '../../src/features/photos/photo-name';
import { AppScreen, FeedbackNotice, GlassInput, GroupedList, Message, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function PrepareScreen() {
  const { id, accountId, selectedIds, qrPayload, scannedAt } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; qrPayload?: string; scannedAt?: string }>(); const store = useVault(); const data = store.data;
  const activity = data?.activityCache.find(a => a.id === id && a.cacheAccountId === accountId);
  const [selectedAccountIds, setSelected] = useState<string[] | null>(() => selectedIds !== undefined ? selectedIds.split(',').filter(Boolean) : null);
  const selected = selectedAccountIds ?? data?.accounts.map(account => account.id) ?? [];
  const [location, setLocation] = useState<LocationInput | null>(null); const [mapOpen, setMapOpen] = useState(false);
  const [code, setCode] = useState(''); const [gesture, setGesture] = useState(''); const [qr, setQr] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reservedPhotoId, setReservedPhotoId] = useState<string | null>(null);
  const [photoLabel, setPhotoLabel] = useState('');
  const notify = useFeedback();
  const theme = useTheme();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => { if (qrPayload) { setQr(qrPayload); setError(''); } }, [qrPayload]);
  if (!data || !activity) return null;

  function input(): SignInput {
    if (!activity) throw new Error('活动不存在');
    if ((activity.kind === 'location' || activity.requirements?.location) && !location) throw new Error('请先选择签到位置');
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
      if (!scannedAt || qr !== qrPayload) throw new Error('请先扫描当前活动的二维码');
      return { kind: 'qr', qrPayload: qr, scannedAt, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'photo') return { kind: 'photo', mediaIdByAccount: {}, ...(location ? { location } : {}) };
    throw new Error('暂不支持此类签到，请在学习通中完成');
  }

  async function pickPhoto(camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!picked.canceled) { setPhotoUri(picked.assets[0].uri); setReservedPhotoId(null); setPhotoLabel(camera ? '刚拍的照片' : '相册照片'); setError(''); notify('已选照片', 'success'); }
    else notify('已取消', 'info');
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
      notify('正在签到…', 'success');
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
      void runJob(store, job.id).catch(e => notify(e instanceof Error ? e.message : '签到失败，请查看结果', 'error'));
    }
    catch (e) { if (stagedUri) clearStagedPhoto(stagedUri); setError(prepareErrorMessage(e, activity?.kind ?? 'unknown')); }
    finally { setBusy(false); }
  }

  const needsLocation = activity.kind === 'location' || activity.requirements?.location;
  const allIds = data.accounts.map(a => a.id);
  const allSelected = selected.length === allIds.length;
  const main = primaryAccount(data);

  return <AppScreen title="准备签到" subtitle={activity.title} backLabel="返回" onBack={() => router.back()}
    headerAction={<YStack backgroundColor="$ongoingHeader" paddingHorizontal={10} paddingVertical={5} borderRadius={999}><Text color="$success" fontSize={12} fontWeight="500">进行中</Text></YStack>}
    footer={<YStack gap={8}>
      {!!error && <FeedbackNotice message={error} tone="error" />}
      {!selected.length && <Message>请至少选择 1 个账号</Message>}
      <PrimaryButton onPress={() => { void start(); }} loading={busy} disabled={!selected.length || activity.kind === 'unknown'}>{`为 ${selected.length} 个账号签到`}</PrimaryButton>
    </YStack>}>

    {needsLocation && <>
      <SectionTitle action={<Pressable onPress={() => setMapOpen(true)} accessibilityRole="button" accessibilityLabel="打开地图选择签到位置" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
        <Text color="$color" fontSize={12} fontWeight="500">地图微调 ›</Text>
      </Pressable>}>签到位置</SectionTitle>
      <GroupedList>
        <SettingsRow title={location?.address ?? '尚未选择位置'} detail={location ? `${location.latitude.toFixed(4)}° N, ${location.longitude.toFixed(4)}° E` : '点击打开地图选点'} last={!data.settings.favoriteLocations.length} onPress={() => setMapOpen(true)} />
        {!!data.settings.favoriteLocations.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
          {data.settings.favoriteLocations.map((item, index) => {
            const active = location?.latitude === item.latitude && location?.longitude === item.longitude && location?.address === item.address;
            return <Pressable key={index} onPress={() => { setLocation(item); setError(''); notify('已选用常用位置', 'success'); }}
              accessibilityRole="button" accessibilityLabel={`选用常用位置 ${item.address}`} accessibilityState={{ selected: active }}
              style={({ pressed }) => ({ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? theme.actionSurface.val : theme.soft.val, opacity: pressed ? 0.65 : 1 })}>
              <Text color={active ? '$actionText' : '$muted'} fontSize={12} fontWeight="500">{item.address}</Text>
            </Pressable>;
          })}
        </ScrollView>}
      </GroupedList>
    </>}
    <MapPicker visible={mapOpen} initial={location} onClose={() => setMapOpen(false)} onPick={point => { setLocation(point); setError(''); notify('位置已选定', 'success'); }} />

    {activity.kind === 'code' && <><SectionTitle>签到码</SectionTitle>
      <GroupedList><YStack padding={16}><GlassInput placeholder="4 至 12 位数字签到码" value={code} onChangeText={value => { setCode(value); setError(''); }} keyboardType="number-pad" /></YStack></GroupedList>
    </>}

    {activity.kind === 'gesture' && <><SectionTitle>手势签到</SectionTitle><GesturePatternPicker value={gesture} onChange={value => { setGesture(value); setError(''); }} /></>}

    {activity.kind === 'qr' && <><SectionTitle>二维码</SectionTitle>
      <GroupedList><YStack padding={16} gap={12}>
        <Message>{scannedAt && qr === qrPayload ? `已于 ${new Date(scannedAt).toLocaleTimeString()} 扫描` : '请扫描当前活动的二维码'}</Message>
        <PrimaryButton variant="secondary" onPress={() => router.push({ pathname: '/scan', params: { id: activity.id, accountId, selectedIds: selected.join(',') } })}>扫描二维码</PrimaryButton>
      </YStack></GroupedList>
    </>}

    {activity.kind === 'photo' && <><SectionTitle>签到照片</SectionTitle><YStack gap={12}>
      {photoUri && <GroupedList><XStack padding={14} alignItems="center" gap={13}>
        <Image source={{ uri: photoUri }} resizeMode="cover" accessibilityLabel="当前选择的签到照片预览" style={{ width: 60, height: 60, borderRadius: 12 }} />
        <YStack flex={1} gap={2}><Text color="$muted" fontSize={12}>当前已选</Text><Text color="$color" fontSize={15} fontWeight="500" numberOfLines={2}>{photoLabel}</Text></YStack>
        <Text color="$success" fontSize={16} fontWeight="600">✓</Text>
      </XStack></GroupedList>}
      {!!data.settings.reservedPhotos.length && <GroupedList><YStack padding={12} gap={10}>
        <Text color="$muted" fontSize={12} marginLeft={2}>预留照片</Text>
        <XStack flexWrap="wrap" gap={8}>
          {data.settings.reservedPhotos.map((photo, index) => {
            const active = reservedPhotoId === photo.id;
            const label = photoName(photo, index);
            return <Pressable key={photo.id} onPress={() => {
              if (!reservedPhotoExists(photo.id)) { notify('该照片文件已丢失，请重新添加', 'error'); return; }
              setReservedPhotoId(photo.id); setPhotoUri(reservedPhotoUri(photo.id)); setPhotoLabel(label); setError(''); notify('已选预留照片', 'success');
            }} accessibilityRole="button" accessibilityLabel={`使用预留照片 ${label}`} accessibilityState={{ selected: active }}
              style={({ pressed }) => ({ width: '31%', minWidth: 92, borderRadius: 14, padding: 8, backgroundColor: theme.soft.val, borderWidth: active ? 1.5 : 0, borderColor: active ? theme.color.val : 'transparent', opacity: pressed ? 0.65 : 1, gap: 6 })}>
              <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" style={{ width: '100%', height: 54, borderRadius: 9 }} />
              <Text color="$color" fontSize={12} fontWeight="500" numberOfLines={1}>{label}</Text>
            </Pressable>;
          })}
        </XStack>
      </YStack></GroupedList>}
      <XStack gap={10}>
        <YStack flex={1}><PrimaryButton variant="secondary" onPress={() => { void pickPhoto(true).catch(e => setError(prepareErrorMessage(e, 'photo'))); }}>拍照</PrimaryButton></YStack>
        <YStack flex={1}><PrimaryButton variant="secondary" onPress={() => { void pickPhoto(false).catch(e => setError(prepareErrorMessage(e, 'photo'))); }}>从相册选择</PrimaryButton></YStack>
      </XStack>
    </YStack></>}

    <SectionTitle action={<Pressable onPress={() => { setError(''); setSelected(allSelected && main ? [main.id] : allIds); }}
      accessibilityRole="button" accessibilityLabel={allSelected ? '仅选自己' : '全选账号'} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={12} fontWeight="500">{allSelected ? '仅选自己' : '全选'}</Text>
    </Pressable>}>{`签到账号 (${selected.length}/${data.accounts.length})`}</SectionTitle>
    <GroupedList>{data.accounts.map((a, index) => {
      const checked = selected.includes(a.id);
      return <SettingsRow key={a.id} title={a.label} indexLabel={String(index + 1).padStart(2, '0')}
        badge={a.role === 'primary' ? '我' : undefined}
        detail={a.state === 'REAUTH_REQUIRED' ? '需要重新登录' : undefined}
        last={index === data.accounts.length - 1}
        onPress={() => { setError(''); setSelected(checked ? selected.filter(id => id !== a.id) : [...selected, a.id]); }}
        accessory={<YStack width={22} height={22} borderRadius={11} alignItems="center" justifyContent="center"
          backgroundColor={checked ? '$actionSurface' : 'transparent'} borderWidth={checked ? 0 : 1.5} borderColor="$fieldBorder">
          {checked && <Text color="$actionText" fontSize={12} fontWeight="600">✓</Text>}
        </YStack>} />;
    })}</GroupedList>
  </AppScreen>;
}
