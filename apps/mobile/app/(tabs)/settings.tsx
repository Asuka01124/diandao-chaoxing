import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';
import type { LocationInput } from '@sign/shared';
import { useVault } from '../../src/state';
import { hasPrimaryAccount, primaryAccount } from '../../src/features/accounts/account-role';
import { removeAccount } from '../../src/features/accounts/account-service';
import { MapPicker } from '../../src/features/location/map-picker';
import { ActionSheet, AppScreen, EmptyState, FeedbackNotice, GroupedList, PrimaryButton, SectionTitle, SettingsRow, useFeedback } from '../../src/ui';

export default function SettingsScreen() {
  const store = useVault(); const data = store.data;
  const [confirm, setConfirm] = useState(false); const [logoutConfirm, setLogoutConfirm] = useState(false); const [error, setError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const notify = useFeedback();
  useEffect(() => { if (store.ready && !hasPrimaryAccount(data)) router.replace('/'); }, [store.ready, data?.accounts]);
  if (!data || !hasPrimaryAccount(data)) return null;
  const main = primaryAccount(data);
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
    <SectionTitle>常用位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => <SettingsRow key={`${location.address}-${index}`} title={location.address} symbol="⌖" onPress={() => {
      void store.update(v => { v.settings.favoriteLocations.splice(index, 1); }).then(() => { setError(''); notify('常用位置已删除', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '删除位置失败'; setError(message); notify(message, 'error'); });
    }} accessory={<Text color="$danger">删除</Text>} />) : <EmptyState title="暂无常用位置" />}</GroupedList>
    <YStack marginTop={12}><PrimaryButton onPress={() => setMapOpen(true)}>添加位置</PrimaryButton></YStack>
    <SectionTitle>数据</SectionTitle><GroupedList><SettingsRow title="清除所有本机数据" symbol="×" onPress={() => setConfirm(true)} /></GroupedList>
    <MapPicker visible={mapOpen} onClose={() => setMapOpen(false)} onPick={(location: LocationInput) => {
      void store.update(v => { v.settings.favoriteLocations.push(location); }).then(() => { setError(''); notify('常用位置已保存', 'success'); }).catch(e => { const message = e instanceof Error ? e.message : '收藏失败'; setError(message); notify(message, 'error'); });
    }} />
    <ActionSheet visible={confirm} title="确定清除所有账号、会话和任务吗？" onClose={() => setConfirm(false)} actions={[{ label: '清除全部本地数据', danger: true, onPress: () => {
      notify('正在清除本机数据…', 'loading');
      void store.clear().then(() => { notify('本机数据已清除', 'success'); router.replace('/'); }).catch(e => { const message = e instanceof Error ? e.message : '清除失败'; setError(message); notify(message, 'error'); });
    } }]} />
    <ActionSheet visible={logoutConfirm} title="退出当前账号？" onClose={() => setLogoutConfirm(false)} actions={[{ label: '退出登录', danger: true, onPress: () => { if (main) {
      notify('正在退出登录…', 'loading');
      void removeAccount(store, main.id).then(() => { notify('已退出登录', 'success'); router.replace('/'); }).catch(e => { const message = e instanceof Error ? e.message : '退出失败'; setError(message); notify(message, 'error'); });
    } } }]} />
  </AppScreen>;
}
