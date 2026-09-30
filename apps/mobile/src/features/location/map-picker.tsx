import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Button, Input, Text, XStack, YStack } from 'tamagui';
import { locationSchema, type LocationInput } from '@sign/shared';
import { PrimaryButton } from '../../ui';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [116.3974, 39.9093];

function placeName(place: Location.LocationGeocodedAddress): string {
  return [place.city || place.region, place.district, place.street, place.streetNumber].filter(Boolean).join(' ');
}

export function MapPicker({ visible, initial, onClose, onPick }: { visible: boolean; initial?: LocationInput | null; onClose: () => void; onPick: (location: LocationInput) => void }) {
  const camera = useRef<CameraRef>(null);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    if (!visible) return;
    request.current++;
    setPoint(initial ? [initial.longitude, initial.latitude] : null);
    setAddress(initial?.address ?? '');
    setMessage('点击地图选择位置，或使用手机当前位置');
  }, [visible, initial?.latitude, initial?.longitude, initial?.address]);

  async function choose(next: [number, number]) {
    const id = ++request.current;
    setPoint(next); setAddress(''); setMessage('正在获取附近地址…');
    camera.current?.easeTo({ center: next, duration: 350 });
    try {
      const results = await Location.reverseGeocodeAsync({ longitude: next[0], latitude: next[1] });
      if (request.current !== id) return;
      setAddress(results[0] ? placeName(results[0]) : '');
      setMessage(results[0] ? '可修改地址名称后确认' : '请输入此位置的地址名称');
    } catch {
      if (request.current === id) setMessage('地址查询失败，请为选中的位置填写名称');
    }
  }

  async function useCurrentLocation() {
    setLocating(true); setMessage('正在获取手机位置…');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('请允许位置权限，或直接点击地图选点');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await choose([current.coords.longitude, current.coords.latitude]);
    } catch (error) { setMessage(error instanceof Error ? error.message : '定位失败，请直接点击地图选点'); }
    finally { setLocating(false); }
  }

  function confirm() {
    const parsed = locationSchema.safeParse({ longitude: point?.[0], latitude: point?.[1], address: address.trim() });
    if (!parsed.success) { setMessage(point ? '请填写位置名称' : '请先在地图上选择位置'); return; }
    onPick(parsed.data); onClose();
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <YStack flex={1} backgroundColor="$background" paddingTop={32}>
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={20} paddingBottom={12}>
        <Pressable onPress={onClose} accessibilityRole="button"><Text color="$brand" fontSize={16}>取消</Text></Pressable>
        <Text color="$color" fontSize={18} fontWeight="700">地图选点</Text>
        <View style={{ width: 32 }} />
      </XStack>
      <View style={{ flex: 1, minHeight: 280 }}>
        <Map mapStyle={MAP_STYLE} style={{ flex: 1 }} attribution
          onDidFailLoadingMap={() => setMessage('地图加载失败，请检查网络后重新打开选点页面')}
          onPress={event => { void choose(event.nativeEvent.lngLat); }}>
          <Camera ref={camera} initialViewState={{ center: initial ? [initial.longitude, initial.latitude] : DEFAULT_CENTER, zoom: initial ? 15 : 10 }} />
          {point && <Marker lngLat={point}><View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#111111', borderWidth: 4, borderColor: '#ffffff' }} /></Marker>}
        </Map>
      </View>
      <YStack padding={20} paddingBottom={30} gap={12} backgroundColor="$panel" borderTopWidth={1} borderColor="$separator">
        <Text color="$muted" fontSize={13}>{message}</Text>
        <Input placeholder="位置名称或详细地址" value={address} onChangeText={setAddress} />
        <Button onPress={() => { void useCurrentLocation(); }} disabled={locating} backgroundColor="$soft" color="$color">{locating ? '正在定位…' : '使用手机当前位置'}</Button>
        <PrimaryButton onPress={confirm}>确认选择此位置</PrimaryButton>
        <Text color="$muted" fontSize={11} textAlign="center">地图数据 © OpenStreetMap 贡献者，地图服务 OpenFreeMap</Text>
      </YStack>
    </YStack>
  </Modal>;
}
