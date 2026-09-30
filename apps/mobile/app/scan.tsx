import { useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { YStack } from 'tamagui';
import { AppScreen, Message, PrimaryButton } from '../src/ui';

export default function ScanScreen() {
  const { id, accountId, selectedIds, jobId } = useLocalSearchParams<{ id: string; accountId?: string; selectedIds?: string; jobId?: string }>();
  const [permission, requestPermission] = useCameraPermissions(); const [locked, setLocked] = useState(false);
  return <AppScreen title="扫描签到码">
    {!permission?.granted ? <YStack gap={14}><Message>扫描仅在前台进行，拍摄内容不会自动保存。</Message><PrimaryButton onPress={() => { void requestPermission(); }}>允许相机</PrimaryButton></YStack> :
      <YStack height={430} borderRadius="$panel" overflow="hidden"><CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => {
        if (locked) return; setLocked(true);
        const scannedAt = new Date().toISOString();
        if (jobId) router.replace({ pathname: '/job/[id]', params: { id: jobId, qrPayload: data, scannedAt } });
        else router.replace({ pathname: '/prepare/[id]', params: { id, accountId, selectedIds, qrPayload: data, scannedAt } });
      }} /></YStack>}
  </AppScreen>;
}
