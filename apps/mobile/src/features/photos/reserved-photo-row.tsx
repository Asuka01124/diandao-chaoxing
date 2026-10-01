import { Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { ReservedPhoto } from '@sign/shared';
import { reservedPhotoUri } from '../../core/media';

export function ReservedPhotoRow({ photo, index, last, selected, onSelect, onDelete }: {
  photo: ReservedPhoto; index: number; last?: boolean; selected?: boolean;
  onSelect?: () => void; onDelete?: () => void;
}) {
  const title = `预留照片 ${index + 1}`;
  const content = <XStack minHeight={82} alignItems="center" gap={13} paddingHorizontal={14} paddingVertical={10}
    borderBottomWidth={last ? 0 : 0.7} borderColor="$separator" backgroundColor={selected ? '$soft' : 'transparent'}>
    <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" accessible={false}
      style={{ width: 58, height: 58, borderRadius: 10 }} />
    <YStack flex={1} gap={3}>
      <Text color="$color" fontSize={15} fontWeight="600">{title}</Text>
      <Text color="$muted" fontSize={12}>保存于 {new Date(photo.createdAt).toLocaleDateString('zh-CN')}</Text>
    </YStack>
    {onDelete ? <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`删除${title}`}
      style={({ pressed }) => ({ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
      <Text color="$danger" fontSize={14}>删除</Text>
    </Pressable> : onSelect ? <Text color={selected ? '$brand' : '$muted'} fontSize={21}>{selected ? '✓' : '›'}</Text> : null}
  </XStack>;
  return onSelect ? <Pressable onPress={onSelect} accessibilityRole="button" accessibilityLabel={`使用${title}`}
    accessibilityState={{ selected: !!selected }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{content}</Pressable> : content;
}
