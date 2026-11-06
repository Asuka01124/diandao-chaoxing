import { useEffect, useState } from 'react';
import { router } from 'expo-router';
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
import { ActionSheet, AppScreen, EmptyState, FeedbackNotice, GlassInput, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

function LocationMenu({ location, onClose, onEdit, onDelete }: { location: LocationInput | null; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const theme = useTheme();
  return <Modal visible={!!location} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="关闭位置操作" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack width="100%" maxWidth={340} backgroundColor="$panel" borderRadius={22} overflow="hidden" shadowColor="#000000" shadowOpacity={0.14} shadowRadius={22} shadowOffset={{ width: 0, height: 10 }} elevation={8}>
        <YStack paddingHorizontal={20} paddingTop={19} paddingBottom={14} gap={4}>
          <Text color="$muted" fontSize={12}>常用位置</Text>
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
    </View>
  </Modal>;
}

function PhotoMenu({ photo, title, onClose, onRename, onReplace, onDelete }: {
  photo: ReservedPhoto | null; title: string; onClose: () => void; onRename: () => void; onReplace: () => void; onDelete: () => void;
}) {
  const theme = useTheme();
  return <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="关闭照片操作" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack width="100%" maxWidth={340} backgroundColor="$panel" borderRadius={22} overflow="hidden" shadowColor="#000000" shadowOpacity={0.14} shadowRadius={22} shadowOffset={{ width: 0, height: 10 }} elevation={8}>
        <XStack padding={18} gap={13} alignItems="center">
          {photo && <Image source={{ uri: reservedPhotoUri(photo.id) }} style={{ width: 52, height: 52, borderRadius: 10 }} />}
          <YStack flex={1} gap={3}><Text color="$muted" fontSize={12}>预留照片</Text><Text color="$color" fontSize={15} fontWeight="500" numberOfLines={2}>{title}</Text></YStack>
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
    </View>
  </Modal>;
}

function PhotoNameDialog({ visible, value, busy, onChange, onClose, onSave }: {
  visible: boolean; value: string; busy: boolean; onChange: (value: string) => void; onClose: () => void; onSave: () => void;
}) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
      <Pressable onPress={onClose} accessibilityLabel="取消更改照片名称" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
      <YStack backgroundColor="$panel" borderRadius={22} padding={20} gap={14} width="100%" maxWidth={340} alignSelf="center">
        <Text color="$color" fontSize={17} fontWeight="500">照片名称</Text>
        <GlassInput value={value} onChangeText={onChange} maxLength={30} placeholder="例如：教学楼门口" autoFocus returnKeyType="done" onSubmitEditing={onSave} />
        <PrimaryButton loading={busy} onPress={onSave}>保存名称</PrimaryButton>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="取消" style={({ pressed }) => ({ minHeight: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
          <Text color="$muted" fontSize={14}>取消</Text>
        </Pressable>
      </YStack>
    </KeyboardAvoidingView>
  </Modal>;
}

export default function SettingsScreen() {
  const store = useVault(); const data = store.data;
  const [logoutConfirm, setLogoutConfirm] = useState(false); const [error, setError] = useState('');
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
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
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
    }).then(() => { setError(''); notify('位置已删除', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '删除位置失败'; setError(message); notify(message, 'error'); });
  }
  async function addReservedPhoto(source: 'camera' | 'album') {
    if (store.get().settings.reservedPhotos.length >= 10) { notify('最多预留 10 张照片', 'error'); return; }
    setSavingPhoto(source);
    try {
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (picked.canceled) { notify('已取消', 'info'); return; }
      const photo = await saveReservedPhoto(picked.assets[0].uri);
      try {
        await store.update(v => {
          if (v.settings.reservedPhotos.length >= 10) throw new Error('最多预留 10 张照片');
          photo.name = `预留照片 ${v.settings.reservedPhotos.length + 1}`;
          v.settings.reservedPhotos.push(photo);
        });
      } catch (error) { try { clearReservedPhoto(photo.id); } catch {} throw error; }
      notify('照片已添加', 'success');
      setTimeout(() => editPhotoName(photo.id), 250);
    } catch (e) { notify(e instanceof Error ? e.message : '添加照片失败', 'error'); }
    finally { setSavingPhoto(null); }
  }
  async function replaceReservedPhoto(id: string, source: 'camera' | 'album') {
    if (savingPhoto) return;
    setPhotoReplaceId(null); setSavingPhoto(source);
    try {
      const picked = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
      if (picked.canceled) { notify('已取消', 'info'); return; }
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
    finally { setSavingPhoto(null); }
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

  return <AppScreen title="设置">
    {!!error && <YStack marginBottom={12}><FeedbackNotice message={error} tone="error" /></YStack>}
    <SectionTitle>我的账号</SectionTitle>
    <GroupedList>
      <SettingsRow title={main?.label ?? '学习通账号'} detail={main?.session.identifier}
        accessory={<YStack backgroundColor="$soft" paddingHorizontal={9} paddingVertical={4} borderRadius={8}><Text fontSize={12} color="$muted">主账号</Text></YStack>} />
      <SettingsRow title="退出登录" last onPress={() => setLogoutConfirm(true)}
        accessory={<Text color="$danger" fontSize={13} fontWeight="500">退出 ›</Text>} />
    </GroupedList>

    <SectionTitle action={<Pressable onPress={() => { setEditingIndex(null); setMapOpen(true); }} accessibilityRole="button" accessibilityLabel="添加常用位置" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={12} fontWeight="500">+ 添加位置</Text>
    </Pressable>}>常用位置</SectionTitle>
    <GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => (
      <SettingsRow key={`${location.address}-${index}`} title={location.address}
        indexLabel={String(index + 1).padStart(2, '0')}
        last={index === data.settings.favoriteLocations.length - 1}
        onPress={() => editLocation(index)} onLongPress={() => setMenuIndex(index)}
        accessibilityHint="轻点打开地图更改位置，长按显示更改和删除操作" />
    )) : <EmptyState title="暂无常用位置" />}</GroupedList>

    <SectionTitle action={data.settings.reservedPhotos.length < 10 ? <Pressable onPress={() => setPhotoAddSheet(true)} disabled={!!savingPhoto} accessibilityRole="button" accessibilityLabel="添加预留照片" style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <Text color="$color" fontSize={12} fontWeight="500">+ 添加照片</Text>
    </Pressable> : undefined}>{`预留照片 · ${data.settings.reservedPhotos.length}/10`}</SectionTitle>
    <GroupedList>{data.settings.reservedPhotos.length ? <YStack padding={12}>
      <XStack flexWrap="wrap" gap={8}>
        {data.settings.reservedPhotos.map((photo, index) => {
          const title = photoName(photo, index);
          return <Pressable key={photo.id} onPress={() => setPhotoMenuId(photo.id)} onLongPress={() => setPhotoMenuId(photo.id)}
            accessibilityRole="button" accessibilityLabel={title} accessibilityHint="点击管理预留照片"
            style={({ pressed }) => ({ width: '31%', minWidth: 92, borderRadius: 14, padding: 9, backgroundColor: theme.soft.val, opacity: pressed ? 0.65 : 1, gap: 6 })}>
            <XStack alignItems="center" justifyContent="space-between">
              <Text color="$muted" fontSize={12}>{String(index + 1).padStart(2, '0')}</Text>
              <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" accessible={false} style={{ width: 28, height: 28, borderRadius: 6 }} />
            </XStack>
            <Text color="$color" fontSize={12} fontWeight="500" numberOfLines={2}>{title}</Text>
          </Pressable>;
        })}
      </XStack>
    </YStack> : <EmptyState title="暂无预留照片" detail="签到时可直接选用" />}</GroupedList>

    <AboutAppSection />

    <MapPicker visible={mapOpen} initial={editingIndex === null ? null : data.settings.favoriteLocations[editingIndex] ?? null} onClose={() => { setMapOpen(false); setEditingIndex(null); }} onPick={(location: LocationInput) => {
      const index = editingIndex;
      void store.update(v => {
        if (index === null) v.settings.favoriteLocations.push(location);
        else if (v.settings.favoriteLocations[index]) v.settings.favoriteLocations[index] = location;
        else throw new Error('原位置已不存在');
      }).then(() => { setError(''); notify(index === null ? '位置已保存' : '位置已更新', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '保存位置失败'; setError(message); notify(message, 'error'); });
    }} />
    <LocationMenu location={menuLocation} onClose={() => setMenuIndex(null)} onEdit={() => {
      if (menuIndex === null) return;
      const index = menuIndex;
      setMenuIndex(null);
      setTimeout(() => editLocation(index), 250);
    }} onDelete={() => { if (menuIndex !== null) deleteLocation(menuIndex); }} />
    <PhotoMenu photo={menuPhoto} title={menuPhoto ? photoName(menuPhoto, menuPhotoIndex) : ''} onClose={() => setPhotoMenuId(null)}
      onRename={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); setTimeout(() => editPhotoName(id), 250); }}
      onReplace={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); setTimeout(() => setPhotoReplaceId(id), 250); }}
      onDelete={() => { if (!photoMenuId) return; const id = photoMenuId; setPhotoMenuId(null); setTimeout(() => setPhotoToDelete(id), 250); }} />
    <PhotoNameDialog visible={!!nameEditingId} value={nameDraft} busy={savingName} onChange={setNameDraft}
      onClose={() => setNameEditingId(null)} onSave={() => { void savePhotoName(); }} />
    <ActionSheet visible={photoAddSheet} title="添加预留照片" onClose={() => setPhotoAddSheet(false)} actions={[
      { label: '从相册选择', onPress: () => { setTimeout(() => { void addReservedPhoto('album'); }, 250); } },
      { label: '拍照添加', onPress: () => { setTimeout(() => { void addReservedPhoto('camera'); }, 250); } },
    ]} />
    <ActionSheet visible={!!photoReplaceId} title="更换预留照片" onClose={() => setPhotoReplaceId(null)} actions={photoReplaceId ? [
      { label: '从相册选择', onPress: () => { const id = photoReplaceId; setTimeout(() => { void replaceReservedPhoto(id, 'album'); }, 250); } },
      { label: '拍摄新照片', onPress: () => { const id = photoReplaceId; setTimeout(() => { void replaceReservedPhoto(id, 'camera'); }, 250); } },
    ] : []} />
    <ActionSheet visible={!!photoToDelete} title="删除这张预留照片？" onClose={() => setPhotoToDelete(null)} actions={photoToDelete ? [
      { label: '删除照片', danger: true, onPress: () => { void deleteReservedPhoto(photoToDelete); } },
    ] : []} />
    <ActionSheet visible={logoutConfirm} title="退出当前账号？" onClose={() => setLogoutConfirm(false)} actions={[{ label: '退出登录', danger: true, onPress: () => { if (main) {
      notify('正在退出…', 'loading');
      void removeAccount(store, main.id).then(() => { notify('已退出登录', 'success'); router.replace('/'); }).catch(e => { const message = e instanceof Error ? e.message : '退出失败'; setError(message); notify(message, 'error'); });
    } } }]} />
  </AppScreen>;
}
