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
      if (result?.granted) notify('相机已启用，请扫描二维码', 'success');
      else if (result) { const message = '未获得相机权限，请在系统设置中允许访问相机'; setError(message); notify(message, 'error'); }
      else notify('请在系统设置中允许访问相机', 'info');
    } catch (e) { const message = e instanceof Error ? e.message : '无法打开相机'; setError(message); notify(message, 'error'); }
    finally { setRequesting(false); }
  }
  return <AppScreen title="扫描签到码">
    {!permission?.granted ? <YStack gap={14}><Message>扫描仅在前台进行，拍摄内容不会自动保存。</Message>{!!error && <FeedbackNotice message={error} tone="error" />}<PrimaryButton loading={requesting} onPress={() => { void enableCamera(); }}>{permission?.canAskAgain === false ? '打开系统设置' : '允许相机'}</PrimaryButton></YStack> :
      <YStack height={430} borderRadius="$panel" overflow="hidden"><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
        if (locked) return; setLocked(true);
        notify('二维码已扫描，正在返回任务', 'success');
        const scannedAt = new Date().toISOString();
        if (jobId) router.replace({ pathname: '/job/[id]', params: { id: jobId, qrPayload: data, scannedAt } });
        else router.replace({ pathname: '/prepare/[id]', params: { id, accountId, selectedIds, qrPayload: data, scannedAt } });
      }} /></YStack>}
  </AppScreen>;
}
