import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { ExpoGaodeMapModule, MapView, Marker, reGeocode, type MapViewRef } from 'expo-gaode-map';
import { Text, XStack, YStack } from 'tamagui';
import { locationSchema, type LocationInput } from '@sign/shared';
import { FeedbackNotice, GlassInput, PrimaryButton, type FeedbackTone } from '../../ui';

const DEFAULT_CENTER = { latitude: 39.9093, longitude: 116.3974 };
const PRIVACY_VERSION = '2026-10-01';

async function getLocationWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ExpoGaodeMapModule.getCurrentLocation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('定位超时，可直接在地图上选点')), 15000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export function MapPicker({ visible, initial, onClose, onPick }: { visible: boolean; initial?: LocationInput | null; onClose: () => void; onPick: (location: LocationInput) => void }) {
  const map = useRef<MapViewRef>(null);
  const request = useRef(0);
  const session = useRef(0);
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [cameraTarget, setCameraTarget] = useState(DEFAULT_CENTER);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [locating, setLocating] = useState(false);
  const [privacyReady, setPrivacyReady] = useState(false);
  const configured = Platform.OS === 'ios' ? !!Constants.expoConfig?.extra?.amapIosConfigured : !!Constants.expoConfig?.extra?.amapAndroidConfigured;

  useEffect(() => {
    if (!visible) return;
    session.current++;
    request.current++;
    setPoint(initial ? { latitude: initial.latitude, longitude: initial.longitude } : null);
    setCameraTarget(initial ? { latitude: initial.latitude, longitude: initial.longitude } : DEFAULT_CENTER);
    setAddress(initial?.address ?? '');
    setMessage(initial ? '当前保存的位置，点按地图可重新选点' : '正在获取当前位置…');
    setMessageTone(initial ? 'info' : 'loading');
    setLocating(!initial);
    if (configured) {
      ExpoGaodeMapModule.setPrivacyVersion(PRIVACY_VERSION);
      const ready = ExpoGaodeMapModule.getPrivacyStatus().isReady;
      setPrivacyReady(ready);
      if (!ready) setLocating(false);
    }
    return () => { session.current++; request.current++; };
  }, [visible, initial?.latitude, initial?.longitude, initial?.address, configured]);

  async function choose(next: { latitude: number; longitude: number }, opened = session.current, moveCamera = true) {
    if (session.current !== opened) return;
    const id = ++request.current;
    setPoint(next); setAddress(''); setMessage('正在查询附近地址…'); setMessageTone('loading');
    if (moveCamera && map.current) void map.current.moveCamera({ target: next, zoom: 16 }, 350).catch(() => {});
    try {
      const result = await reGeocode({ location: next });
      if (request.current !== id || session.current !== opened) return;
      setAddress(result.pois[0]?.name || result.formattedAddress || '');
      setMessage('已选中位置，确认名称后即可使用'); setMessageTone('success');
    } catch {
      if (request.current === id && session.current === opened) { setMessage('地址查询失败，请填写位置名称'); setMessageTone('error'); }
    }
  }

  async function locate(opened: number) {
    setLocating(true); setMessage('正在定位…'); setMessageTone('loading');
    try {
      const permission = await ExpoGaodeMapModule.requestLocationPermission();
      if (session.current !== opened) return;
      if (!permission.granted) throw new Error('未获得定位权限，可直接在地图上选点；自动定位需在系统设置中开启权限');
      const current = await getLocationWithTimeout();
      if (session.current !== opened) return;
      const next = { latitude: current.latitude, longitude: current.longitude };
      setCameraTarget(next);
      void choose(next, opened, false);
    } catch (error) {
      if (session.current === opened) { setMessage(error instanceof Error ? error.message : '定位失败，可直接在地图上选点'); setMessageTone('error'); }
    } finally { if (session.current === opened) setLocating(false); }
  }

  function confirm() {
    const parsed = locationSchema.safeParse({ longitude: point?.longitude, latitude: point?.latitude, address: address.trim() });
    if (!parsed.success) { setMessage(point ? '请填写位置名称' : '请先选择位置'); setMessageTone('error'); return; }
    onPick(parsed.data); onClose();
  }

  function acceptPrivacy() {
    ExpoGaodeMapModule.setPrivacyConfig({ hasShow: true, hasContainsPrivacy: true, hasAgree: true, privacyVersion: PRIVACY_VERSION });
    setPrivacyReady(true);
    if (!initial) void locate(session.current);
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => {
    if (configured && !initial && ExpoGaodeMapModule.getPrivacyStatus().isReady) void locate(session.current);
  }}>
    <YStack flex={1} backgroundColor="$background" paddingTop={32}>
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={20} paddingBottom={16}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="取消选择位置" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' })}><Text color="$brand" fontSize={16}>取消</Text></Pressable>
        <Text color="$color" fontSize={18} fontWeight="700">选择位置</Text>
        <View style={{ width: 32 }} />
      </XStack>
      {!configured ? <YStack flex={1} justifyContent="center" padding={24} gap={10}>
        <Text color="$color" fontSize={18} fontWeight="600">地图暂不可用</Text>
        <Text color="$muted">高德地图尚未配置，请稍后更新应用。</Text>
      </YStack> : !privacyReady ? <YStack flex={1} justifyContent="center" padding={24} gap={16}>
        <Text color="$color" fontSize={20} fontWeight="700">首次使用高德地图</Text>
        <Text color="$muted" fontSize={15} lineHeight={23}>地图由高德开放平台提供，会处理位置和设备信息以显示地图、定位和查询附近地址。首次使用需同意其隐私政策；之后新增位置时会直接请求系统定位权限并自动定位。</Text>
        <Text color="$brand" fontSize={14} onPress={() => { void Linking.openURL('https://lbs.amap.com/pages/privacy/'); }}>查看高德地图隐私权政策 ›</Text>
        <PrimaryButton onPress={acceptPrivacy}>同意并继续</PrimaryButton>
      </YStack> : locating ? <YStack flex={1} justifyContent="center" alignItems="center" gap={14}>
        <ActivityIndicator size="large" />
        <Text color="$muted">正在获取当前位置…</Text>
      </YStack> : <>
        <View style={{ flex: 1, minHeight: 280 }}>
          <MapView ref={map} style={{ flex: 1 }} initialCameraPosition={{ target: cameraTarget, zoom: point ? 16 : 10 }}
            onMapPress={event => { void choose(event.nativeEvent); }}>
            {point && <Marker position={point} pinColor="red" />}
          </MapView>
        </View>
        <YStack padding={20} paddingBottom={30} gap={12} backgroundColor="$panel" borderTopLeftRadius={25} borderTopRightRadius={25}>
          <FeedbackNotice message={message} tone={messageTone} />
          <GlassInput placeholder="位置名称或详细地址" value={address} onChangeText={setAddress} accessibilityLabel="位置名称或详细地址" />
          <PrimaryButton onPress={confirm}>使用此位置</PrimaryButton>
          <Text color="$muted" fontSize={11} textAlign="center">地图服务由高德开放平台提供</Text>
        </YStack>
      </>}
    </YStack>
  </Modal>;
}
