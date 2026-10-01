import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { ExpoGaodeMapModule, MapView, Marker, reGeocode, type MapViewRef } from 'expo-gaode-map';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { locationSchema, type LocationInput } from '@sign/shared';
import { FeedbackNotice, PrimaryButton, type FeedbackTone } from '../../ui';

const DEFAULT_CENTER = { latitude: 39.9093, longitude: 116.3974 };
const PRIVACY_VERSION = '2026-10-01';

export function MapPicker({ visible, initial, onClose, onPick }: { visible: boolean; initial?: LocationInput | null; onClose: () => void; onPick: (location: LocationInput) => void }) {
  const map = useRef<MapViewRef>(null);
  const request = useRef(0);
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<FeedbackTone>('info');
  const [locating, setLocating] = useState(false);
  const [privacyReady, setPrivacyReady] = useState(false);
  const configured = Platform.OS === 'ios' ? !!Constants.expoConfig?.extra?.amapIosConfigured : !!Constants.expoConfig?.extra?.amapAndroidConfigured;

  useEffect(() => {
    if (!visible) return;
    request.current++;
    setPoint(initial ? { latitude: initial.latitude, longitude: initial.longitude } : null);
    setAddress(initial?.address ?? '');
    setMessage('点击地图选点，或使用当前位置');
    setMessageTone('info');
    if (configured) {
      ExpoGaodeMapModule.setPrivacyVersion(PRIVACY_VERSION);
      setPrivacyReady(ExpoGaodeMapModule.getPrivacyStatus().isReady);
    }
  }, [visible, initial?.latitude, initial?.longitude, initial?.address, configured]);

  async function choose(next: { latitude: number; longitude: number }) {
    const id = ++request.current;
    setPoint(next); setAddress(''); setMessage('正在查询附近地址…'); setMessageTone('loading');
    if (map.current) void map.current.moveCamera({ target: next, zoom: 16 }, 350).catch(() => {});
    try {
      const result = await reGeocode({ location: next });
      if (request.current !== id) return;
      setAddress(result.pois[0]?.name || result.formattedAddress || '');
      setMessage('已选中位置，确认名称后即可使用'); setMessageTone('success');
    } catch {
      if (request.current === id) { setMessage('地址查询失败，请填写位置名称'); setMessageTone('error'); }
    }
  }

  async function useCurrentLocation() {
    setLocating(true); setMessage('正在定位…'); setMessageTone('loading');
    try {
      const permission = await ExpoGaodeMapModule.requestLocationPermission();
      if (!permission.granted) throw new Error('请允许位置权限，或直接在地图上选点');
      const current = await ExpoGaodeMapModule.getCurrentLocation();
      await choose({ latitude: current.latitude, longitude: current.longitude });
    } catch (error) { setMessage(error instanceof Error ? error.message : '定位失败，请在地图上选点'); setMessageTone('error'); }
    finally { setLocating(false); }
  }

  function confirm() {
    const parsed = locationSchema.safeParse({ longitude: point?.longitude, latitude: point?.latitude, address: address.trim() });
    if (!parsed.success) { setMessage(point ? '请填写位置名称' : '请先选择位置'); setMessageTone('error'); return; }
    onPick(parsed.data); onClose();
  }

  function acceptPrivacy() {
    ExpoGaodeMapModule.setPrivacyConfig({ hasShow: true, hasContainsPrivacy: true, hasAgree: true, privacyVersion: PRIVACY_VERSION });
    setPrivacyReady(true);
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <YStack flex={1} backgroundColor="$background" paddingTop={32}>
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={20} paddingBottom={12}>
        <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1, padding: 6 })}><Text color="$brand" fontSize={16}>取消</Text></Pressable>
        <Text color="$color" fontSize={18} fontWeight="700">选择位置</Text>
        <View style={{ width: 32 }} />
      </XStack>
      {!configured ? <YStack flex={1} justifyContent="center" padding={24} gap={10}>
        <Text color="$color" fontSize={18} fontWeight="600">地图暂不可用</Text>
        <Text color="$muted">高德地图尚未配置，请稍后更新应用。</Text>
      </YStack> : !privacyReady ? <YStack flex={1} justifyContent="center" padding={24} gap={16}>
        <Text color="$color" fontSize={20} fontWeight="700">使用高德地图</Text>
        <Text color="$muted" fontSize={15} lineHeight={23}>地图由高德开放平台提供。选点时，高德地图 SDK 会处理位置信息及设备信息，用于显示地图、定位和查询附近地址。</Text>
        <Text color="$brand" fontSize={14} onPress={() => { void Linking.openURL('https://lbs.amap.com/pages/privacy/'); }}>查看高德地图隐私权政策 ›</Text>
        <PrimaryButton onPress={acceptPrivacy}>同意并打开地图</PrimaryButton>
      </YStack> : <>
        <View style={{ flex: 1, minHeight: 280 }}>
          <MapView ref={map} style={{ flex: 1 }} initialCameraPosition={{ target: initial ? { latitude: initial.latitude, longitude: initial.longitude } : DEFAULT_CENTER, zoom: initial ? 16 : 10 }}
            onMapPress={event => { void choose(event.nativeEvent); }}>
            {point && <Marker position={point} pinColor="red" />}
          </MapView>
        </View>
        <YStack padding={20} paddingBottom={30} gap={12} backgroundColor="$panel" borderTopWidth={1} borderColor="$separator">
          <FeedbackNotice message={message} tone={messageTone} />
          <Input placeholder="位置名称或详细地址" value={address} onChangeText={setAddress} />
          <Button onPress={() => { void useCurrentLocation(); }} disabled={locating} opacity={locating ? 0.6 : 1} pressStyle={{ opacity: 0.7, scale: 0.98 }} backgroundColor="$soft" color="$color" minHeight={48} accessibilityState={{ busy: locating, disabled: locating }}>{locating && <ActivityIndicator size="small" />}{locating ? '正在定位…' : '使用当前位置'}</Button>
          <PrimaryButton onPress={confirm}>使用此位置</PrimaryButton>
          <Text color="$muted" fontSize={11} textAlign="center">地图服务由高德开放平台提供</Text>
        </YStack>
      </>}
    </YStack>
  </Modal>;
}
