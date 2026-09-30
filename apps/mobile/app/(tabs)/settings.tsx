import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { LocationInput } from '@sign/shared';
import { useVault } from '../../src/state';
import { hasPrimaryAccount } from '../../src/features/accounts/account-role';
import { MapPicker } from '../../src/features/location/map-picker';
import { ActionSheet, AppScreen, EmptyState, GroupedList, HeroCard, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function SettingsScreen() {
  const store = useVault(); const data = store.data;
  const [confirm, setConfirm] = useState(false); const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;
  return <AppScreen title="设置" subtitle="管理本机资料和使用偏好">
    <HeroCard eyebrow="隐私与安全" title="资料保存在本机" detail="账号与任务记录加密保存在这台设备。" />
    <SectionTitle>本地资料</SectionTitle><GroupedList>
      <SettingsRow title="账号数" detail={String(data.accounts.length)} symbol="◉" />
      <SettingsRow title="任务数" detail={String(data.jobs.length)} symbol="✓" />
      <SettingsRow title="界面外观" symbol="◐" detail={data.settings.appearance === 'system' ? '跟随系统' : data.settings.appearance === 'light' ? '亮色' : '暗色'} onPress={() => { void store.update(v => { v.settings.appearance = v.settings.appearance === 'system' ? 'light' : v.settings.appearance === 'light' ? 'dark' : 'system'; }); }} />
      <SettingsRow title="失败任务照片保留" symbol="▧" detail={`${data.settings.imageRetentionHours} 小时；已上传完成的临时文件立即清理`} onPress={() => { void store.update(v => { v.settings.imageRetentionHours = v.settings.imageRetentionHours === 24 ? 1 : 24; }); }} />
      <SettingsRow title="清除全部本地数据" symbol="×" onPress={() => setConfirm(true)} />
    </GroupedList>
    <SectionTitle>收藏位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => <SettingsRow key={`${location.address}-${index}`} title={location.address} detail={`${location.latitude}, ${location.longitude}`} symbol="⌖" onPress={() => { void store.update(v => { v.settings.favoriteLocations.splice(index, 1); }); }} accessory={<Text color="$danger">删除</Text>} />) : <EmptyState title="暂无收藏位置" detail="常用位置可在下方添加" />}</GroupedList>
    <YStack marginTop={12}><PrimaryButton onPress={() => setMapOpen(true)}>在地图上添加收藏位置</PrimaryButton></YStack>
    <MapPicker visible={mapOpen} onClose={() => setMapOpen(false)} onPick={(location: LocationInput) => {
      void store.update(v => { v.settings.favoriteLocations.push(location); }).then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : '收藏失败'));
    }} />
    <ActionSheet visible={confirm} title="确定清除所有账号、会话和任务吗？" onClose={() => setConfirm(false)} actions={[{ label: '清除全部本地数据', danger: true, onPress: () => { void store.clear().then(() => router.replace('/')).catch(e => setError(e instanceof Error ? e.message : '清除失败')); } }]} />
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
