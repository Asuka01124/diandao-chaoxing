import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Input, Text, YStack } from 'tamagui';
import { locationSchema } from '@sign/shared';
import { testApiConnection } from '../../src/core/api';
import { useVault } from '../../src/state';
import { ActionSheet, AppScreen, EmptyState, GroupedList, HeroCard, Message, PrimaryButton, SectionTitle, SettingsRow } from '../../src/ui';

export default function SettingsScreen() {
  const store = useVault(); const data = store.data; const [confirm, setConfirm] = useState(false); const [error, setError] = useState('');
  const [address, setAddress] = useState(''); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState('');
  const [apiUrl, setApiUrl] = useState(data?.settings.apiUrl ?? '');
  useEffect(() => { setApiUrl(data?.settings.apiUrl ?? ''); }, [data?.settings.apiUrl]);
  useEffect(() => { if (!data) router.replace('/'); }, [!!data]); if (!data) return null;
  return <AppScreen title="设置" subtitle="连接服务与管理本机数据">
    <HeroCard eyebrow="隐私与安全" title="开箱即可使用" detail="默认从手机直连学习通 HTTPS 接口。账号与任务记录加密保存在本机，无需配置服务地址。" />
    <SectionTitle>连接方式</SectionTitle><GroupedList><SettingsRow title="自动直连" detail={apiUrl ? '已启用自定义网关' : '无需配置，使用手机网络连接学习通'} symbol="↗" /></GroupedList>
    <SectionTitle>高级选项 · 自定义网关</SectionTitle><YStack backgroundColor="$panel" borderRadius="$panel" padding={16} gap={10}>
      <Message>仅当你有自己的 HTTPS 网关时填写。留空并保存即可恢复自动直连。</Message>
      <Input placeholder="https://api.example.com" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="HTTPS API 地址" backgroundColor="$field" borderWidth={0} borderRadius="$control" minHeight={46} />
      <PrimaryButton onPress={() => {
        try {
          const value = apiUrl.trim();
          const parsed = value ? new URL(value) : null;
          if (parsed && (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)) throw new Error('请输入有效的 HTTPS 地址');
          void store.update(v => { v.settings.apiUrl = parsed?.toString().replace(/\/$/, ''); }).then(() => setError(parsed ? '网关地址已保存' : '已恢复自动直连')).catch(e => setError(e instanceof Error ? e.message : '保存失败'));
        } catch { setError('请输入有效的 HTTPS 地址'); }
      }}>保存连接方式</PrimaryButton>
      {!!apiUrl && <PrimaryButton onPress={() => { void testApiConnection(apiUrl.trim()).then(ok => setError(ok ? '网关连接正常' : '无法连接网关，请检查地址和证书')).catch(() => setError('请输入有效的 HTTPS 地址')); }}>测试网关</PrimaryButton>}
    </YStack>
    <SectionTitle>本地资料</SectionTitle><GroupedList><SettingsRow title="账号数" detail={String(data.accounts.length)} symbol="◉" /><SettingsRow title="任务数" detail={String(data.jobs.length)} symbol="✓" />
      <SettingsRow title="界面外观" symbol="◐" detail={data.settings.appearance === 'system' ? '跟随系统' : data.settings.appearance === 'light' ? '亮色' : '暗色'} onPress={() => { void store.update(v => { v.settings.appearance = v.settings.appearance === 'system' ? 'light' : v.settings.appearance === 'light' ? 'dark' : 'system'; }); }} />
      <SettingsRow title="失败任务照片保留" symbol="▧" detail={`${data.settings.imageRetentionHours} 小时；已上传完成的临时文件立即清理`} onPress={() => { void store.update(v => { v.settings.imageRetentionHours = v.settings.imageRetentionHours === 24 ? 1 : 24; }); }} />
      <SettingsRow title="锁定工具" symbol="⌁" onPress={() => { store.lock(); router.replace('/'); }} />
      <SettingsRow title="清除全部本地数据" symbol="×" onPress={() => setConfirm(true)} /></GroupedList>
    <SectionTitle>收藏位置</SectionTitle><GroupedList>{data.settings.favoriteLocations.length ? data.settings.favoriteLocations.map((location, index) => <SettingsRow key={`${location.address}-${index}`} title={location.address} detail={`${location.latitude}, ${location.longitude}`} symbol="⌖" onPress={() => { void store.update(v => { v.settings.favoriteLocations.splice(index, 1); }); }} accessory={<Text color="$danger">删除</Text>} />) : <EmptyState title="暂无收藏位置" detail="常用位置可在下方添加" />}</GroupedList>
    <YStack backgroundColor="$panel" borderRadius="$panel" padding={16} marginTop={12} gap={10}>
      <Input placeholder="地址" value={address} onChangeText={setAddress} /><Input placeholder="纬度" value={latitude} onChangeText={setLatitude} keyboardType="decimal-pad" /><Input placeholder="经度" value={longitude} onChangeText={setLongitude} keyboardType="decimal-pad" />
      <PrimaryButton onPress={() => { const parsed = locationSchema.safeParse({ address, latitude: Number(latitude), longitude: Number(longitude) }); if (!parsed.success) { setError('位置格式无效'); return; } void store.update(v => { v.settings.favoriteLocations.push(parsed.data); }).then(() => { setAddress(''); setLatitude(''); setLongitude(''); setError(''); }); }}>收藏位置</PrimaryButton>
    </YStack>
    <ActionSheet visible={confirm} title="确定清除所有账号、会话和任务吗？" onClose={() => setConfirm(false)} actions={[{ label: '清除全部本地数据', danger: true, onPress: () => { void store.clear().then(() => router.replace('/')).catch(e => setError(e instanceof Error ? e.message : '清除失败')); } }]} />
    {!!error && <Text color="$danger" marginTop={12}>{error}</Text>}
  </AppScreen>;
}
