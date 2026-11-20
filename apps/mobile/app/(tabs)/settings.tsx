import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack, useTheme } from 'tamagui';
import type { LocationInput, ReservedPhoto } from '@sign/shared';
import { useVault } from '../../src/state';
import { hasPrimaryAccount, primaryAccount } from '../../src/features/accounts/account-role';
import { AboutAppSection } from '../../src/features/updates/about-app-section';
import { removeAccount } from '../../src/features/accounts/account-service';
import { MapPicker } from '../../src/features/location/map-picker';
import { cleanPhotoName, photoName } from '../../src/features/photos/photo-name';
import { clearReservedPhoto, reservedPhotoUri, saveReservedPhoto } from '../../src/core/media';
import { ActionSheet, AppScreen, EmptyState, GlassInput, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

function LocationMenu({ location, onClose, onEdit, onDelete }: { location: LocationInput | null; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="关闭位置操作" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack width="100%" maxWidth={340} backgroundColor="$panel" borderRadius={22} overflow="hidden" shadowColor="#000000" shadowOpacity={0.14} shadowRadius={22} shadowOffset={{ width: 0, height: 10 }} elevation={8}>
        <YStack paddingHorizontal={20} paddingTop={19} paddingBottom={14} gap={4}>
          <Text color="$color" fontSize={16} lineHeight={23} fontWeight="500" numberOfLines={2}>{location?.address}</Text>
        </YStack>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="更改位置" style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.55 : 1 })}>
          <Text color="$color" fontSize={15}>更改位置</Text>
        </Pressable>
        <YStack height={1} backgroundColor="$separator" marginHorizontal={20} />
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel="删除位置" style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.55 : 1 })}>
          <Text color="$danger" fontSize={15}>删除位置</Text>
        </Pressable>
      </YStack>
  </View>;
}

function PhotoMenu({ photo, title, onClose, onRename, onReplace, onDelete }: {
  photo: ReservedPhoto | null; title: string; onClose: () => void; onRename: () => void; onReplace: () => void; onDelete: () => void;
}) {
  const theme = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="关闭照片操作" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack width="100%" maxWidth={340} backgroundColor="$panel" borderRadius={22} overflow="hidden" shadowColor="#000000" shadowOpacity={0.14} shadowRadius={22} shadowOffset={{ width: 0, height: 10 }} elevation={8}>
        <XStack padding={18} gap={13} alignItems="center">
          {photo && <Image source={{ uri: reservedPhotoUri(photo.id) }} style={{ width: 52, height: 52, borderRadius: 10 }} />}
          <YStack flex={1} gap={3}><Text color="$color" fontSize={15} fontWeight="500" numberOfLines={2}>{title}</Text></YStack>
        </XStack>
        {([
          { label: '更改名称', action: onRename },
          { label: '更换照片', action: onReplace },
          { label: '删除照片', action: onDelete, danger: true },
        ] as const).map(item => <Pressable key={item.label} onPress={item.action} accessibilityRole="button" accessibilityLabel={item.label}
          style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.55 : 1 })}>
          <Text color={'danger' in item ? '$danger' : '$color'} fontSize={15}>{item.label}</Text>
        </Pressable>)}
      </YStack>
  </View>;
}

function PhotoNameDialog({ value, busy, onChange, onClose, onSave }: {
  value: string; busy: boolean; onChange: (value: string) => void; onClose: () => void; onSave: () => void;
}) {
  const theme = useTheme();
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="取消更改照片名称" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack backgroundColor="$panel" borderRadius={22} padding={20} gap={14} width="100%" maxWidth={340} alignSelf="center">
        <Text color="$color" fontSize={17} fontWeight="500">照片名称</Text>
        <GlassInput value={value} onChangeText={onChange} maxLength={30} accessibilityLabel="照片名称" autoFocus returnKeyType="done" onSubmitEditing={onSave} />
        <PrimaryButton loading={busy} onPress={onSave}>保存名称</PrimaryButton>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="取消" style={({ pressed }) => ({ minHeight: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
          <Text color="$muted" fontSize={14}>取消</Text>
        </Pressable>
      </YStack>
  </KeyboardAvoidingView>;
}

export default function SettingsScreen() {
  const store = useVault(); const data = store.data;
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [mapOpen, setMapOpen] = useState(false); const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [savingPhoto, setSavingPhoto] = useState<'camera' | 'album' | null>(null);
  const [photoMenuId, setPhotoMenuId] = useState<string | null>(null);
  const [photoReplaceId, setPhotoReplaceId] = useState<string | null>(null);
  const [nameEditingId, setNameEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [photoAddSheet, setPhotoAddSheet] = useState(false);
  const notify = useFeedback();
  const theme = useTheme();
  if (!data || !hasPrimaryAccount(data)) return null;
  const main = primaryAccount(data);
  const menuLocation = menuIndex === null ? null : data.settings.favoriteLocations[menuIndex] ?? null;
  const menuPhotoIndex = data.settings.reservedPhotos.findIndex(photo => photo.id === photoMenuId);
  const menuPhoto = menuPhotoIndex < 0 ? null : data.settings.reservedPhotos[menuPhotoIndex];

  function editPhotoName(id: string) {
    const index = store.get().settings.reservedPhotos.findIndex(photo => photo.id === id);
    if (index < 0) { notify('照片已不存在', 'error'); return; }
    setNameDraft(photoName(store.get().settings.reservedPhotos[index], index));
    setNameEditingId(id);
  }
  function editLocation(index: number) { setMenuIndex(null); setEditingIndex(index); setMapOpen(true); }
  function deleteLocation(index: number) {
    setMenuIndex(null);
    void store.update(v => {
      if (!v.settings.favoriteLocations[index]) throw new Error('该位置已不存在');
      v.settings.favoriteLocations.splice(index, 1);
    }).then(() => { notify('位置已删除', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '删除位置失败'; notify(message, 'error'); });
  }
  async function addReservedPhoto(source: 'camera' | 'album') {
    if (savingPhoto) return;
    if (store.get().settings.reservedPhotos.length >= 10) { notify('最多预留 10 张照片', 'error'); return; }
    setSavingPhoto(source);
    try {
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (picked.canceled) return;
      const photo = await saveReservedPhoto(picked.assets[0].uri);
      try {
        await store.update(v => {
          if (v.settings.reservedPhotos.length >= 10) throw new Error('最多预留 10 张照片');
          photo.name = `预留照片 ${v.settings.reservedPhotos.length + 1}`;
          v.settings.reservedPhotos.push(photo);
        });
      } catch (error) { try { clearReservedPhoto(photo.id); } catch {} throw error; }
      notify('照片已添加', 'success');
      setPhotoAddSheet(false);
      editPhotoName(photo.id);
    } catch (e) { notify(e instanceof Error ? e.message : '添加照片失败', 'error'); }
    finally { setSavingPhoto(null); }
  }
  async function replaceReservedPhoto(id: string, source: 'camera' | 'album') {
    if (savingPhoto) return;
    setSavingPhoto(source);
    try {
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (picked.canceled) return;
      const replacement = await saveReservedPhoto(picked.assets[0].uri);
      try {
        await store.update(v => {
          const index = v.settings.reservedPhotos.findIndex(photo => photo.id === id);
          if (index < 0) throw new Error('原照片已不存在');
          replacement.name = photoName(v.settings.reservedPhotos[index], index);
          v.settings.reservedPhotos[index] = replacement;
        });
      } catch (error) { try { clearReservedPhoto(replacement.id); } catch {} throw error; }
      try { clearReservedPhoto(id); notify('照片已更换', 'success'); }
      catch { notify('照片已更换，但旧文件清理失败', 'error'); }
    } catch (e) { notify(e instanceof Error ? e.message : '更换照片失败', 'error'); }
    finally { setSavingPhoto(null); setPhotoReplaceId(null); }
  }
  async function savePhotoName() {
    if (!nameEditingId || savingName) return;
    try {
      const name = cleanPhotoName(nameDraft);
      setSavingName(true);
      await store.update(v => {
        const photo = v.settings.reservedPhotos.find(item => item.id === nameEditingId);
        if (!photo) throw new Error('照片已不存在');
        photo.name = name;
      });
      setNameEditingId(null); notify('名称已保存', 'success');
    } catch (e) { notify(e instanceof Error ? e.message : '保存名称失败', 'error'); }
    finally { setSavingName(false); }
  }
  async function deleteReservedPhoto(id: string) {
    try { await store.update(v => { v.settings.reservedPhotos = v.settings.reservedPhotos.filter(photo => photo.id !== id); }); }
    catch (e) { notify(e instanceof Error ? e.message : '删除照片失败', 'error'); return; }
    try { clearReservedPhoto(id); notify('照片已删除', 'success'); }
    catch { notify('照片已删除，但文件清理失败', 'error'); }
  }

  function closeSettingsDialog() {
    if (savingPhoto || savingName) return;
    setMapOpen(false); setEditingIndex(null); setMenuIndex(null);
    setPhotoMenuId(null); setNameEditingId(null);
    setPhotoAddSheet(false); setPhotoReplaceId(null); setPhotoToDelete(null);
  }
  return <AppScreen title="设置">
    <SectionTitle>我的账号</SectionTitle>
    <GroupedList>
      <SettingsRow title={main?.label ?? '学习通账号'} detail={main?.label !== main?.session.identifier ? main?.session.identifier : undefined} />
      <SettingsRow title="退出登录" last onPress={() => setLogoutConfirm(true)} />
    </GroupedList>

    <SectionTitle action={<Pressable onPress={() => { setEditingIndex(null); setMapOpen(true); }} accessibilityRole="button" accessibilityLabel="添加常用位置" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={14} fontWeight="500">+ 添加位置</Text>
    </Pressable>}>常用位置</SectionTitle>
    <GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => (
      <SettingsRow key={`${location.address}-${index}`} title={location.address}
        last={index === data.settings.favoriteLocations.length - 1}
        onPress={() => editLocation(index)} onLongPress={() => setMenuIndex(index)}
        accessibilityHint="轻点打开地图更改位置，长按显示更改和删除操作" />
    )) : <EmptyState title="暂无常用位置" />}</GroupedList>

    <SectionTitle action={data.settings.reservedPhotos.length < 10 ? <Pressable onPress={() => setPhotoAddSheet(true)} disabled={!!savingPhoto} accessibilityRole="button" accessibilityLabel="添加预留照片" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={14} fontWeight="500">+ 添加照片</Text>
    </Pressable> : undefined}>预留照片</SectionTitle>
    <GroupedList>{data.settings.reservedPhotos.length ? <YStack paddingVertical={8}>
      <XStack flexWrap="wrap" gap={8}>
        {data.settings.reservedPhotos.map((photo, index) => {
          const title = photoName(photo, index);
          return <Pressable key={photo.id} onPress={() => setPhotoMenuId(photo.id)} onLongPress={() => setPhotoMenuId(photo.id)}
            accessibilityRole="button" accessibilityLabel={title} accessibilityHint="点击管理预留照片"
            style={({ pressed }) => ({ width: '31%', borderRadius: 8, padding: 4, opacity: pressed ? 0.65 : 1, gap: 6 })}>
            <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" accessible={false} style={{ width: '100%', aspectRatio: 1.5, borderRadius: 6 }} />
            <Text color="$color" fontSize={14} fontWeight="500" numberOfLines={2}>{title}</Text>
          </Pressable>;
        })}
      </XStack>
    </YStack> : <EmptyState title="暂无预留照片" />}</GroupedList>

    <AboutAppSection />

    <Modal visible={!!(mapOpen || menuLocation || menuPhoto || nameEditingId || photoAddSheet || photoReplaceId || photoToDelete)}
      transparent animationType="fade" onRequestClose={closeSettingsDialog}>
    {mapOpen ? <MapPicker embedded visible={mapOpen} initial={editingIndex === null ? null : data.settings.favoriteLocations[editingIndex] ?? null} onClose={() => { setMapOpen(false); setEditingIndex(null); }} onPick={(location: LocationInput) => {
      const index = editingIndex;
      void store.update(v => {
        if (index === null) v.settings.favoriteLocations.push(location);
        else if (v.settings.favoriteLocations[index]) v.settings.favoriteLocations[index] = location;
        else throw new Error('原位置已不存在');
      }).then(() => { notify(index === null ? '位置已保存' : '位置已更新', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '保存位置失败'; notify(message, 'error'); });
    }} />
    : menuLocation ? <LocationMenu location={menuLocation} onClose={() => setMenuIndex(null)} onEdit={() => {
      if (menuIndex === null) return;
      const index = menuIndex;
      editLocation(index);
    }} onDelete={() => { if (menuIndex !== null) deleteLocation(menuIndex); }} />
    : menuPhoto ? <PhotoMenu photo={menuPhoto} title={menuPhoto ? photoName(menuPhoto, menuPhotoIndex) : ''} onClose={() => setPhotoMenuId(null)}
      onRename={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); editPhotoName(id); }}
      onReplace={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); setPhotoReplaceId(id); }}
      onDelete={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); setPhotoToDelete(id); }} />
    : nameEditingId ? <PhotoNameDialog value={nameDraft} busy={savingName} onChange={setNameDraft}
      onClose={() => setNameEditingId(null)} onSave={() => { void savePhotoName(); }} />
    : photoAddSheet ? <ActionSheet embedded visible closeOnPress={false} title="添加预留照片" onClose={() => setPhotoAddSheet(false)} actions={[
      { label: '从相册选择', onPress: () => { void addReservedPhoto('album').finally(() => setPhotoAddSheet(false)); } },
      { label: '拍照添加', onPress: () => { void addReservedPhoto('camera').finally(() => setPhotoAddSheet(false)); } },
    ]} />
    : photoReplaceId ? <ActionSheet embedded visible closeOnPress={false} title="更换预留照片" onClose={() => setPhotoReplaceId(null)} actions={photoReplaceId ? [
      { label: '从相册选择', onPress: () => { void replaceReservedPhoto(photoReplaceId, 'album'); } },
      { label: '拍摄新照片', onPress: () => { void replaceReservedPhoto(photoReplaceId, 'camera'); } },
    ] : []} />
    : photoToDelete ? <ActionSheet embedded visible title="删除这张预留照片？" onClose={() => setPhotoToDelete(null)} actions={photoToDelete ? [
      { label: '删除照片', danger: true, onPress: () => { void deleteReservedPhoto(photoToDelete); } },
    ] : []} /> : null}
    </Modal>
    <ActionSheet visible={logoutConfirm} title="退出当前账号？" onClose={() => setLogoutConfirm(false)} actions={[{ label: '退出登录', danger: true, onPress: () => { if (main) {
      notify('正在退出…', 'loading');
      void removeAccount(store, main.id).catch(e => { const message = e instanceof Error ? e.message : '退出失败'; notify(message, 'error'); });
    } } }]} />
  </AppScreen>;
}
