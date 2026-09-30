import type React from 'react';
import { Modal, Pressable } from 'react-native';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';

export function SettingsRow({ title, detail, onPress, accessory, symbol, selected }: { title: string; detail?: string; onPress?: () => void; accessory?: React.ReactNode; symbol?: string; selected?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${title}${detail ? `，${detail}` : ''}`}>
    <XStack minHeight={61} alignItems="center" justifyContent="space-between" paddingHorizontal={16} borderBottomWidth={1} borderColor="$separator" gap={12} backgroundColor={selected ? '$soft' : '$panel'}>
      {symbol && <YStack width={32} height={32} borderRadius={9} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text fontSize={17} color="$brand" fontWeight="600">{symbol}</Text></YStack>}
      <YStack flex={1} paddingVertical={10} gap={2}><Text fontSize={16} fontWeight="500" color="$color">{title}</Text>{detail && <Text fontSize={13} color="$muted" numberOfLines={2}>{detail}</Text>}</YStack>
      {accessory ?? (onPress && <Text color="$muted" fontSize={24} fontWeight="300">›</Text>)}
    </XStack>
  </Pressable>;
}
export function PrimaryButton({ children, onPress, disabled, danger }: { children: React.ReactNode; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return <Button backgroundColor={danger ? '$danger' : '$brand'} color="$onAccent" borderRadius="$control" minHeight={50} fontSize={16} fontWeight="600" disabled={disabled} opacity={disabled ? 0.45 : 1} pressStyle={{ opacity: 0.78 }} onPress={onPress}>{children}</Button>;
}

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: { label: string; onPress: () => void; danger?: boolean }[]; onClose: () => void }) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay.val }} onPress={onClose}>
    <YStack backgroundColor="$panel" padding={20} borderTopLeftRadius="$panel" borderTopRightRadius="$panel" gap={8}>
      <Text color="$color" fontSize={18} fontWeight="600" textAlign="center" marginBottom={8}>{title}</Text>
      {actions.map(action => <PrimaryButton key={action.label} danger={action.danger} onPress={() => { onClose(); action.onPress(); }}>{action.label}</PrimaryButton>)}
      <Button onPress={onClose}>取消</Button>
    </YStack>
  </Pressable></Modal>;
}
export function Message({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={14} lineHeight={21}>{children}</Text>; }
