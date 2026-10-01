import { Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';
import type { ReservedPhoto } from '@sign/shared';
import { EmptyState, GroupedList } from '../../ui';
import { ReservedPhotoRow } from './reserved-photo-row';

export function ReservedPhotoPicker({ visible, photos, selectedId, onClose, onPick }: {
  visible: boolean; photos: ReservedPhoto[]; selectedId?: string | null;
  onClose: () => void; onPick: (photo: ReservedPhoto) => void;
}) {
  const theme = useTheme();
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <YStack flex={1} paddingHorizontal={22} paddingTop={22}>
        <XStack alignItems="center" justifyContent="space-between" marginBottom={18}>
          <Text color="$color" fontSize={24} fontWeight="600" accessibilityRole="header">选择预留照片</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="取消选择预留照片"
            style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
            <Text color="$brand" fontSize={16}>取消</Text>
          </Pressable>
        </XStack>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
          <GroupedList>{photos.length ? photos.map((photo, index) =>
            <ReservedPhotoRow key={photo.id} photo={photo} index={index} last={index === photos.length - 1}
              selected={selectedId === photo.id} onSelect={() => onPick(photo)} />)
            : <EmptyState title="暂无预留照片" detail="可以在设置中添加，或返回后直接拍照" />}</GroupedList>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  </Modal>;
}
