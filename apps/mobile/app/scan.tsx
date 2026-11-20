import { useRef, useState } from 'react';
import { Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import { AppScreen, FeedbackNotice, Message, PrimaryButton } from '../src/ui';

export default function ScanScreen() {
  const { id, accountId, selectedIds, jobId } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; jobId?: string }>();
  const [permission, requestPermission] = useCameraPermissions(); const locked = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  async function enableCamera() {
    setRequesting(true); setError('');
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else if (!(await requestPermission()).granted) setError('请允许访问相机后再试');
    } catch (e) { setError(e instanceof Error ? e.message : '无法打开相机'); }
    finally { setRequesting(false); }
  }
  return <AppScreen title="扫描二维码" backLabel="返回" onBack={() => router.back()}
    footer={permission && !permission.granted && <PrimaryButton variant="dock" loading={requesting} onPress={() => { void enableCamera(); }}>
      {permission.canAskAgain ? '允许使用相机' : '打开系统设置'}
    </PrimaryButton>}>
    {!permission ? <FeedbackNotice message="正在检查相机权限…" tone="loading" /> : !permission.granted
      ? <YStack gap={12}>{error ? <FeedbackNotice message={error} tone="error" /> : <Message>相机仅用于扫码，画面不会保存。</Message>}</YStack> :
      <YStack height={420} borderRadius={22} overflow="hidden" backgroundColor="$soft"><CameraView style={{ flex: 1 }} onCameraReady={() => setCameraReady(true)} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
        if (locked.current) return;
        locked.current = true;
        const scannedAt = new Date().toISOString();
        if (jobId) router.replace({ pathname: '/job/[id]', params: { id: jobId, qrPayload: data, scannedAt } });
        else router.replace({ pathname: '/prepare/[id]', params: { id, accountId, selectedIds, qrPayload: data, scannedAt } });
      }} />
        {!cameraReady && <XStack position="absolute" inset={0} justifyContent="center" alignItems="center" backgroundColor="$soft" pointerEvents="none">
          <FeedbackNotice message="正在启动相机…" tone="loading" />
        </XStack>}
      </YStack>}
  </AppScreen>;
}
