import { useState } from 'react';
import { Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { YStack } from 'tamagui';
import { AppScreen, FeedbackNotice, Message, PrimaryButton, useFeedback } from '../src/ui';

export default function ScanScreen() {
  const { id, accountId, selectedIds, jobId } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; jobId?: string }>();
  const [permission, requestPermission] = useCameraPermissions(); const [locked, setLocked] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const notify = useFeedback();
  async function enableCamera() {
    setRequesting(true); setError(''); notify('正在请求相机权限…', 'loading');
    try {
      const result = permission?.canAskAgain === false ? (await Linking.openSettings(), null) : await requestPermission();
      if (result?.granted) notify('相机已启用', 'success');
      else if (result) { const message = '请在系统设置中允许访问相机'; setError(message); notify(message, 'error'); }
      else notify('请在系统设置中允许访问相机', 'info');
    } catch (e) { const message = e instanceof Error ? e.message : '无法打开相机'; setError(message); notify(message, 'error'); }
    finally { setRequesting(false); }
  }
  return <AppScreen title="扫描二维码" backLabel="返回" onBack={() => router.back()}>
    {!permission?.granted ? <YStack gap={14}><Message>请允许使用相机扫描签到二维码，画面不会保存。</Message>{!!error && <FeedbackNotice message={error} tone="error" />}<PrimaryButton loading={requesting} onPress={() => { void enableCamera(); }}>{permission?.canAskAgain === false ? '打开系统设置' : '允许使用相机'}</PrimaryButton></YStack> :
      <YStack height={420} borderRadius={22} overflow="hidden"><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
        if (locked) return; setLocked(true);
        notify('已扫描二维码', 'success');
        const scannedAt = new Date().toISOString();
        if (jobId) router.replace({ pathname: '/job/[id]', params: { id: jobId, qrPayload: data, scannedAt } });
        else router.replace({ pathname: '/prepare/[id]', params: { id, accountId, selectedIds, qrPayload: data, scannedAt } });
      }} /></YStack>}
  </AppScreen>;
}
