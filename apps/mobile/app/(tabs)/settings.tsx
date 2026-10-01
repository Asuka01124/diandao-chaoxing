import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Modal, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { LocationInput } from '@sign/shared';
import { useVault } from '../../src/state';
import { hasPrimaryAccount, primaryAccount } from '../../src/features/accounts/account-role';
import { removeAccount } from '../../src/features/accounts/account-service';
import { MapPicker } from '../../src/features/location/map-picker';
import { ReservedPhotoRow } from '../../src/features/photos/reserved-photo-row';
import { clearReservedPhoto, saveReservedPhoto } from '../../src/core/media';
import { ActionSheet, AppScreen, EmptyState, FeedbackNotice, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

function LocationMenu({ location, onClose, onEdit, onDelete }: { location: LocationInput | null; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme();
  return <Modal visible={!!location} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="关闭位置操作" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack width="100%" maxWidth={340} backgroundColor="$panel" borderRadius={22} overflow="hidden" shadowColor="#000000" shadowOpacity={0.14} shadowRadius={22} shadowOffset={{ width: 0, height: 10 }} elevation={8}>
        <YStack paddingHorizontal={20} paddingTop={19} paddingBottom={14} gap={5}>
          <Text color="$muted" fontSize={12}>常用位置</Text>
          <Text color="$color" fontSize={16} lineHeight={23} fontWeight="600" numberOfLines={2}>{location?.address}</Text>
        </YStack>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="更改位置" style={({ pressed }) => ({ minHeight: 54, justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.55 : 1 })}>
          <Text color="$color" fontSize={16}>更改位置</Text>
        </Pressable>
        <YStack height={1} backgroundColor="$separator" marginHorizontal={20} />
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="删除位置" style={({ pressed }) => ({ minHeight: 54, justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.55 : 1 })}>
          <Text color="$danger" fontSize={16}>删除位置</Text>
        </Pressable>
      </YStack>
    </View>
  </Modal>;
}

export default function SettingsScreen() {
  const store = useVault(); const data = store.data;
  const [logoutConfirm, setLogoutConfirm] = useState(false); const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false); const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [savingPhoto, setSavingPhoto] = useState<'camera' | 'album' | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;
  const main = primaryAccount(data);
  const menuLocation = menuIndex === null ? null : data.settings.favoriteLocations[menuIndex] ?? null;
  function editLocation(index: number) { setMenuIndex(null); setEditingIndex(index); setMapOpen(true); }
  function deleteLocation(index: number) {
    setMenuIndex(null);
    void store.update(v => {
      if (!v.settings.favoriteLocations[index]) throw new Error('该位置已不存在');
      v.settings.favoriteLocations.splice(index, 1);
    }).then(() => { setError(''); notify('常用位置已删除', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '删除位置失败'; setError(message); notify(message, 'error'); });
  }
  async function addReservedPhoto(source: 'camera' | 'album') {
    if (store.get().settings.reservedPhotos.length >= 10) { notify('最多预留 10 张照片', 'error'); return; }
    setSavingPhoto(source);
    try {
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (picked.canceled) { notify('已取消添加照片', 'info'); return; }
      const photo = await saveReservedPhoto(picked.assets[0].uri);
      try {
        await store.update(v => {
          if (v.settings.reservedPhotos.length >= 10) throw new Error('最多预留 10 张照片');
          v.settings.reservedPhotos.push(photo);
        });
      } catch (error) { try { clearReservedPhoto(photo.id); } catch {} throw error; }
      notify('照片已预留，可在照片签到时使用', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : '预留照片失败', 'error'); }
    finally { setSavingPhoto(null); }
  }
  async function deleteReservedPhoto(id: string) {
    try { await store.update(v => { v.settings.reservedPhotos = v.settings.reservedPhotos.filter(photo => photo.id !== id); }); }
    catch (e) { notify(e instanceof Error ? e.message : '删除照片失败', 'error'); return; }
    try { clearReservedPhoto(id); notify('预留照片已删除', 'success'); }
    catch { notify('照片已从列表删除，但本机文件清理失败', 'error'); }
  }
  return <AppScreen title="设置">
    {!!error && <FeedbackNotice message={error} tone="error" />}
    <SectionTitle>我的账号</SectionTitle><GroupedList>
      <SettingsRow title={main?.label ?? '学习通账号'} detail={main?.session.identifier} symbol="我" />
      <SettingsRow title="退出登录" symbol="↗" onPress={() => setLogoutConfirm(true)} />
    </GroupedList>
    <SectionTitle>偏好</SectionTitle><GroupedList>
      <SettingsRow title="界面外观" symbol="◐" detail={data.settings.appearance === 'system' ? '跟随系统' : data.settings.appearance === 'light' ? '亮色' : '暗色'} onPress={() => {
        const next = data.settings.appearance === 'system' ? 'light' : data.settings.appearance === 'light' ? 'dark' : 'system';
        void store.update(v => { v.settings.appearance = next; }).then(() => { setError(''); notify(`界面已切换为${next === 'system' ? '跟随系统' : next === 'light' ? '亮色' : '暗色'}`, 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '切换外观失败'; setError(message); notify(message, 'error'); });
      }} />
      <SettingsRow title="失败照片保留" symbol="▧" detail={`${data.settings.imageRetentionHours} 小时`} onPress={() => {
        const hours = data.settings.imageRetentionHours === 24 ? 1 : 24;
        void store.update(v => { v.settings.imageRetentionHours = hours; }).then(() => { setError(''); notify(`失败照片将保留 ${hours} 小时`, 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '保存设置失败'; setError(message); notify(message, 'error'); });
      }} />
    </GroupedList>
    <SectionTitle>常用位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => <SettingsRow key={`${location.address}-${index}`} title={location.address} detail="轻点更改，长按管理" symbol="⌖" onPress={() => editLocation(index)} onLongPress={() => setMenuIndex(index)} accessibilityHint="轻点打开地图更改位置，长按显示更改和删除操作" />) : <EmptyState title="暂无常用位置" />}</GroupedList>
    <YStack marginTop={12}><PrimaryButton onPress={() => { setEditingIndex(null); setMapOpen(true); }}>添加位置</PrimaryButton></YStack>
    <SectionTitle>预留照片 · {data.settings.reservedPhotos.length}/10</SectionTitle>
    <GroupedList>{data.settings.reservedPhotos.length ? data.settings.reservedPhotos.map((photo, index) =>
      <ReservedPhotoRow key={photo.id} photo={photo} index={index} last={index === data.settings.reservedPhotos.length - 1} onDelete={() => setPhotoToDelete(photo.id)} />)
      : <EmptyState title="暂无预留照片" detail="提前保存照片，拍照签到时可以直接选用" />}</GroupedList>
    <XStack marginTop={12} gap={10}>
      <YStack flex={1}><PrimaryButton disabled={data.settings.reservedPhotos.length >= 10 || !!savingPhoto} loading={savingPhoto === 'album'} onPress={() => { void addReservedPhoto('album'); }}>相册添加</PrimaryButton></YStack>
      <YStack flex={1}><PrimaryButton disabled={data.settings.reservedPhotos.length >= 10 || !!savingPhoto} loading={savingPhoto === 'camera'} onPress={() => { void addReservedPhoto('camera'); }}>拍摄预留</PrimaryButton></YStack>
    </XStack>
    <Text color="$muted" fontSize={12} lineHeight={18} marginTop={8}>预留照片保存在本机，直到你删除；不受失败照片保留时长影响。</Text>
    {data.settings.reservedPhotos.length >= 10 && <Text color="$muted" fontSize={12} lineHeight={18}>已达到 10 张上限，删除一张后可继续添加。</Text>}
    <MapPicker visible={mapOpen} initial={editingIndex === null ? null : data.settings.favoriteLocations[editingIndex] ?? null} onClose={() => { setMapOpen(false); setEditingIndex(null); }} onPick={(location: LocationInput) => {
      const index = editingIndex;
      void store.update(v => {
        if (index === null) v.settings.favoriteLocations.push(location);
        else if (v.settings.favoriteLocations[index]) v.settings.favoriteLocations[index] = location;
        else throw new Error('原位置已不存在');
      }).then(() => { setError(''); notify(index === null ? '常用位置已保存' : '常用位置已更改', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '保存位置失败'; setError(message); notify(message, 'error'); });
    }} />
    <LocationMenu location={menuLocation} onClose={() => setMenuIndex(null)} onEdit={() => {
      if (menuIndex === null) return;
      const index = menuIndex;
      setMenuIndex(null);
      setTimeout(() => editLocation(index), 250);
    }} onDelete={() => { if (menuIndex !== null) deleteLocation(menuIndex); }} />
    <ActionSheet visible={!!photoToDelete} title="删除这张预留照片？" onClose={() => setPhotoToDelete(null)} actions={photoToDelete ? [
      { label: '删除照片', danger: true, onPress: () => { void deleteReservedPhoto(photoToDelete); } },
    ] : []} />
    <ActionSheet visible={logoutConfirm} title="退出当前账号？" onClose={() => setLogoutConfirm(false)} actions={[{ label: '退出登录', danger: true, onPress: () => { if (main) {
      notify('正在退出登录…', 'loading');
      void removeAccount(store, main.id).then(() => { notify('已退出登录', 'success'); router.replace('/'); }).catch(e => { const message = e instanceof Error ? e.message : '退出失败'; setError(message); notify(message, 'error'); });
    } } }]} />
  </AppScreen>;
}
