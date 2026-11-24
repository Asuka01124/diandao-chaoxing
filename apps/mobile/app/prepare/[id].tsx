import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import * as ImagePicker from 'expo-image-picker';
import type { Activity, LocationInput, SignInput } from '@sign/shared';
import { api, ClientError } from '../../src/core/api';
import { createJob, runJob } from '../../src/core/jobs';
import { clearStagedPhoto, reservedPhotoExists, reservedPhotoUri, stagePhoto } from '../../src/core/media';
import { useVault } from '../../src/state';
import { hasPrimaryAccount, primaryAccount } from '../../src/features/accounts/account-role';
import { GesturePatternPicker } from '../../src/features/courses/gesture-pattern-picker';
import { isDemoActivity } from '../../src/features/courses/demo-course';
import { prepareErrorMessage } from '../../src/features/courses/prepare-error';
import { MapPicker } from '../../src/features/location/map-picker';
import { photoName } from '../../src/features/photos/photo-name';
import { AppScreen, EmptyState, FeedbackNotice, GlassInput, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function PrepareScreen() {
  const { id, accountId, selectedIds, qrPayload, scannedAt, previousJobId } = useLocalSearchParams<{
    id: string; accountId?: string; selectedIds?: string; qrPayload?: string; scannedAt?: string; previousJobId?: string;
  }>();
  const store = useVault();
  const data = store.data;
  const account = data?.accounts.find(item => item.id === accountId) ?? primaryAccount(data);
  const previousJob = data?.jobs.find(item => item.id === previousJobId && item.activity.id === id);
  const cached = data?.activityCache.find(item => item.id === id && item.cacheAccountId === account?.id) ?? previousJob?.activity;
  const [loadAttempt, setLoadAttempt] = useState(0);
  const detailKey = cached && account ? `${account.id}:${cached.id}:${loadAttempt}` : '';
  const [detail, setDetail] = useState<{ key: string; activity?: Activity; error?: string }>();
  const activity = detail?.key === detailKey ? detail.activity : undefined;
  const detailError = detail?.key === detailKey ? detail.error : undefined;
  const [selectedAccountIds, setSelected] = useState<string[] | null>(() => selectedIds !== undefined ? selectedIds.split(',').filter(Boolean) : null);
  const selected = selectedAccountIds ?? data?.accounts.map(item => item.id) ?? [];
  const previousInput = previousJob?.input;
  const [location, setLocation] = useState<LocationInput | null>(() => previousInput?.kind === 'location' ? previousInput : previousInput?.location ?? null);
  const [mapOpen, setMapOpen] = useState(false);
  const effectiveQr = qrPayload ?? (previousInput?.kind === 'qr' ? previousInput.qrPayload : undefined);
  const effectiveScanTime = scannedAt ?? (previousInput?.kind === 'qr' ? previousInput.scannedAt : undefined);
  const [oldQr, setOldQr] = useState(false);
  const [code, setCode] = useState(() => previousInput?.kind === 'code' ? previousInput.code : '');
  const [gesture, setGesture] = useState(() => previousInput?.kind === 'gesture' ? previousInput.sequence : '');
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reservedPhotoId, setReservedPhotoId] = useState<string | null>(null);
  const [photoLabel, setPhotoLabel] = useState('');
  const notify = useFeedback();
  const theme = useTheme();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  useEffect(() => {
    if (!cached || !account || isDemoActivity(cached)) return;
    let active = true;
    const load = async () => {
      try {
        const fresh = await api.detail(account.session, cached).catch(async error => {
          if (!(error instanceof ClientError) || error.code !== 'SESSION_EXPIRED') throw error;
          const session = await api.check(account.session);
          await store.update(vault => {
            const saved = vault.accounts.find(item => item.id === account.id);
            if (saved) { saved.session = session; saved.state = 'VALID'; saved.verifiedAt = new Date().toISOString(); }
          });
          return api.detail(session, cached);
        });
        if (!active) return;
        await store.update(vault => {
          const index = vault.activityCache.findIndex(item => item.id === fresh.id && item.cacheAccountId === account.id);
          const saved = { ...fresh, cacheAccountId: account.id };
          if (index < 0) vault.activityCache.push(saved);
          else {
            const current = vault.activityCache[index];
            vault.activityCache[index] = { ...current, kind: saved.kind, requirements: saved.requirements, relation: saved.relation, startTime: saved.startTime, endTime: saved.endTime };
          }
        });
        if (active) setDetail({ key: detailKey, activity: fresh });
      } catch (error) {
        if (active) setDetail({ key: detailKey, error: prepareErrorMessage(error, cached.kind) });
      }
    };
    void load();
    return () => { active = false; };
  }, [detailKey]);
  useEffect(() => {
    if (!effectiveScanTime) { setOldQr(false); return; }
    const remaining = Date.parse(effectiveScanTime) + 120_000 - Date.now();
    setOldQr(remaining <= 0);
    if (remaining > 0 && remaining <= 120_000) {
      const timer = setTimeout(() => setOldQr(true), remaining);
      return () => clearTimeout(timer);
    }
  }, [effectiveScanTime]);

  if (!data || !account || !cached || isDemoActivity(cached)) {
    return <AppScreen title="活动签到" backLabel="返回" onBack={() => router.back()}>
      {store.ready && <EmptyState title="未找到签到活动，请从课程列表重新打开" />}
    </AppScreen>;
  }
  if (!activity || activity.kind === 'unknown') {
    return <AppScreen title="活动签到" backLabel="返回" onBack={() => router.back()}
      footer={(detailError || activity) && <PrimaryButton variant="dock" onPress={() => setLoadAttempt(value => value + 1)}>重新加载签到要求</PrimaryButton>}>
      {detailError || activity
        ? <FeedbackNotice message={detailError ?? '暂不支持此类签到，请在学习通中完成'} tone="error" />
        : <FeedbackNotice message="正在加载签到要求…" tone="loading" />}
    </AppScreen>;
  }

  function input(): SignInput {
    if (!activity) throw new Error('活动不存在');
    if ((activity.kind === 'location' || activity.requirements?.location) && !location) throw new Error('请先选择签到位置');
    if (activity.kind === 'click') return { kind: 'click', ...(location ? { location } : {}) };
    if (activity.kind === 'location') return { kind: 'location', ...location! };
    if (activity.kind === 'code') {
      const trimmed = code.trim();
      const expected = activity.codeLength;
      const valid = expected ? new RegExp(`^\\d{${expected}}$`).test(trimmed) : /^\d{4,12}$/.test(trimmed);
      if (!valid) throw new Error(expected ? `请输入 ${expected} 位数字签到码。` : '请输入 4 至 12 位数字签到码。');
      return { kind: 'code', code: trimmed, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'gesture') {
      if (gesture.length < 4) throw new Error('请按顺序选择至少 4 个不同的圆点。');
      return { kind: 'gesture', sequence: gesture, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'qr') {
      if (!effectiveScanTime || !effectiveQr) throw new Error('请先扫描当前活动的二维码');
      return { kind: 'qr', qrPayload: effectiveQr, scannedAt: effectiveScanTime, ...(location ? { location } : {}) };
    }
    if (activity.kind === 'photo') return { kind: 'photo', mediaIdByAccount: {}, ...(location ? { location } : {}) };
    throw new Error('暂不支持此类签到，请在学习通中完成');
  }

  async function pickPhoto(camera: boolean) {
    const picked = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (!picked.canceled) { setPhotoUri(picked.assets[0].uri); setReservedPhotoId(null); setPhotoLabel(camera ? '刚拍的照片' : '相册照片'); }
  }

  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
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
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
      void runJob(store, job.id).catch(e => notify(e instanceof Error ? e.message : '签到失败，请查看结果', 'error'));
    }
    catch (e) { if (stagedUri) clearStagedPhoto(stagedUri); notify(prepareErrorMessage(e, activity?.kind ?? 'unknown'), 'error'); }
    finally { starting.current = false; setBusy(false); }
  }

  const needsLocation = activity.kind === 'location' || activity.requirements?.location;
  const allIds = data.accounts.map(a => a.id);
  const allSelected = selected.length === allIds.length;
  const main = primaryAccount(data);

  const qrReady = !!effectiveScanTime && !!effectiveQr;
  const needsScan = activity.kind === 'qr' && !qrReady;
  const openScanner = () => router.push({ pathname: '/scan', params: { id: activity.id, accountId: account.id, selectedIds: selected.join(','), previousJobId } });
  const actionLabel = !selected.length ? '请选择签到账号' : needsScan ? '扫描活动二维码' : `为 ${selected.length} 个账号签到`;

  return <AppScreen title="活动签到" backLabel="返回" onBack={() => router.back()} keyboardAware
    footer={<PrimaryButton variant="dock" onPress={needsScan ? openScanner : () => { void start(); }} loading={busy}
      disabled={!selected.length}>{actionLabel}</PrimaryButton>}>

    {needsLocation && <>
      <SectionTitle>签到位置</SectionTitle>
      <GroupedList>
        <SettingsRow title={location?.address ?? '尚未选择位置'} last={!data.settings.favoriteLocations.length} onPress={() => setMapOpen(true)} />
        {!!data.settings.favoriteLocations.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
          {data.settings.favoriteLocations.map((item, index) => {
            const active = location?.latitude === item.latitude && location?.longitude === item.longitude && location?.address === item.address;
            return <Pressable key={index} onPress={() => { setLocation(item); }}
              accessibilityRole="button" accessibilityLabel={`选用常用位置 ${item.address}`} accessibilityState={{ selected: active }}
              style={({ pressed }) => ({ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? theme.actionSurface.val : theme.soft.val, opacity: pressed ? 0.65 : 1 })}>
              <Text color={active ? '$actionText' : '$muted'} fontSize={14} fontWeight="500">{item.address}</Text>
            </Pressable>;
          })}
        </ScrollView>}
      </GroupedList>
    </>}
    <MapPicker visible={mapOpen} initial={location} onClose={() => setMapOpen(false)} onPick={setLocation} />

    {activity.kind === 'code' && <><SectionTitle>签到码</SectionTitle>
      <GroupedList><GlassInput accessibilityLabel="签到码" placeholder={activity.codeLength ? `${activity.codeLength} 位数字` : '4 至 12 位数字'} value={code} onChangeText={setCode} keyboardType="number-pad" /></GroupedList>
    </>}

    {activity.kind === 'gesture' && <><SectionTitle>手势签到</SectionTitle><GesturePatternPicker value={gesture} onChange={setGesture} /></>}

    {activity.kind === 'qr' && <><SectionTitle>验证流程</SectionTitle>
      <GroupedList>
        <SettingsRow title="活动二维码" value={qrReady ? '已扫描' : '待扫描'} detail={qrReady && oldQr ? '扫码时间较久，可以重新扫码' : undefined} onPress={openScanner} />
        {activity.requirements?.face && <SettingsRow title="人脸验证" value="自动使用已录入照片" />}
      </GroupedList>
    </>}

    {activity.kind === 'photo' && <><SectionTitle>签到照片</SectionTitle><YStack gap={12}>
      {photoUri && <GroupedList><XStack padding={14} alignItems="center" gap={13}>
        <Image source={{ uri: photoUri }} resizeMode="cover" accessibilityLabel="当前选择的签到照片预览" style={{ width: 60, height: 60, borderRadius: 12 }} />
        <YStack flex={1} gap={2}><Text color="$color" fontSize={15} fontWeight="500" numberOfLines={2}>{photoLabel}</Text></YStack>
        <Text color="$success" fontSize={16} fontWeight="600">✓</Text>
      </XStack></GroupedList>}
      {!!data.settings.reservedPhotos.length && <GroupedList><YStack padding={12} gap={10}>
        <Text color="$muted" fontSize={14} marginLeft={2}>预留照片</Text>
        <XStack flexWrap="wrap" gap={8}>
          {data.settings.reservedPhotos.map((photo, index) => {
            const active = reservedPhotoId === photo.id;
            const label = photoName(photo, index);
            return <Pressable key={photo.id} onPress={() => {
              if (!reservedPhotoExists(photo.id)) { notify('该照片文件已丢失，请重新添加', 'error'); return; }
              setReservedPhotoId(photo.id); setPhotoUri(reservedPhotoUri(photo.id)); setPhotoLabel(label);
            }} accessibilityRole="button" accessibilityLabel={`使用预留照片 ${label}`} accessibilityState={{ selected: active }}
              style={({ pressed }) => ({ width: '31%', minWidth: 92, borderRadius: 14, padding: 8, backgroundColor: theme.soft.val, borderWidth: active ? 1.5 : 0, borderColor: active ? theme.color.val : 'transparent', opacity: pressed ? 0.65 : 1, gap: 6 })}>
              <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" style={{ width: '100%', height: 54, borderRadius: 9 }} />
              <Text color="$color" fontSize={14} fontWeight="500" numberOfLines={1}>{label}</Text>
            </Pressable>;
          })}
        </XStack>
      </YStack></GroupedList>}
      <XStack gap={10}>
        <YStack flex={1}><PrimaryButton variant="secondary" onPress={() => { void pickPhoto(true).catch(e => notify(prepareErrorMessage(e, 'photo'), 'error')); }}>拍照</PrimaryButton></YStack>
        <YStack flex={1}><PrimaryButton variant="secondary" onPress={() => { void pickPhoto(false).catch(e => notify(prepareErrorMessage(e, 'photo'), 'error')); }}>从相册选择</PrimaryButton></YStack>
      </XStack>
    </YStack></>}

    <SectionTitle action={data.accounts.length > 1 && <Pressable hitSlop={8} onPress={() => setSelected(allSelected && main ? [main.id] : allIds)}
      accessibilityRole="button" accessibilityLabel={allSelected ? '仅选自己' : '全选账号'} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={14} fontWeight="500">{allSelected ? '仅选自己' : '全选'}</Text>
    </Pressable>}>签到账号</SectionTitle>
    <GroupedList>{data.accounts.map((a, index) => {
      const checked = selected.includes(a.id);
      return <SettingsRow key={a.id} title={a.label} selected={checked}
        detail={a.state === 'REAUTH_REQUIRED' ? '需要重新登录' : undefined}
        last={index === data.accounts.length - 1}
        onPress={() => setSelected(checked ? selected.filter(id => id !== a.id) : [...selected, a.id])}
        accessory={<Text color="$color" fontSize={16}>{checked ? '✓' : ''}</Text>} />;
    })}</GroupedList>
  </AppScreen>;
}
