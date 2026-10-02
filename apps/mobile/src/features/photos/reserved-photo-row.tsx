import { Image, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { ReservedPhoto } from '@sign/shared';
import { reservedPhotoUri } from '../../core/media';
import { photoName } from './photo-name';

export function ReservedPhotoRow({ photo, index, last, selected, detail, onSelect, onLongPress }: {
  photo: ReservedPhoto; index: number; last?: boolean; selected?: boolean;
  detail?: string; onSelect?: () => void; onLongPress?: () => void;
}) {
  const title = photoName(photo, index);
  const content = <XStack minHeight={82} alignItems="center" gap={13} paddingHorizontal={14} paddingVertical={10}
    borderBottomWidth={last ? 0 : 0.7} borderColor="$separator" backgroundColor={selected ? '$soft' : 'transparent'}>
    <Image source={{ uri: reservedPhotoUri(photo.id) }} resizeMode="cover" accessible={false}
      style={{ width: 58, height: 58, borderRadius: 10 }} />
    <YStack flex={1} gap={3}>
      <Text color="$color" fontSize={15} fontWeight="600" numberOfLines={2}>{title}</Text>
      <Text color="$muted" fontSize={12}>{detail ?? `保存于 ${new Date(photo.createdAt).toLocaleDateString('zh-CN')}`}</Text>
    </YStack>
    {onSelect ? <Text color={selected ? '$brand' : '$muted'} fontSize={21}>{selected ? '✓' : '›'}</Text> : null}
  </XStack>;
  return onSelect || onLongPress ? <Pressable onPress={onSelect} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={title}
    accessibilityHint={onLongPress ? '轻点更换照片，长按打开照片管理菜单' : detail ?? '轻点使用此照片'}
    accessibilityActions={onLongPress ? [{ name: 'manage', label: '管理照片' }] : undefined}
    onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === 'manage') onLongPress(); } : undefined}
    accessibilityState={{ selected: !!selected }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>{content}</Pressable> : content;
}
