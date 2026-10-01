import type React from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { Button, Text, XStack, YStack, useTheme } from 'tamagui';

export function SettingsRow({ title, detail, onPress, accessory, symbol, selected }: { title: string; detail?: string; onPress?: () => void; accessory?: React.ReactNode; symbol?: string; selected?: boolean }) {
  return <Pressable onPress={onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${title}${detail ? `，${detail}` : ''}`} accessibilityState={onPress ? { selected: !!selected } : undefined}
    style={({ pressed }) => ({ opacity: onPress && pressed ? 0.58 : 1 })}>
    <XStack minHeight={61} alignItems="center" justifyContent="space-between" paddingHorizontal={16} borderBottomWidth={1} borderColor="$separator" gap={12} backgroundColor={selected ? '$soft' : '$panel'}>
      {symbol && <YStack width={32} height={32} borderRadius={9} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text fontSize={17} color="$brand" fontWeight="600">{symbol}</Text></YStack>}
      <YStack flex={1} paddingVertical={10} gap={2}><Text fontSize={16} fontWeight="500" color="$color">{title}</Text>{detail && <Text fontSize={13} color="$muted" numberOfLines={2}>{detail}</Text>}</YStack>
      {accessory ?? (onPress && <Text color="$muted" fontSize={24} fontWeight="300">›</Text>)}
    </XStack>
  </Pressable>;
}
export function PrimaryButton({ children, onPress, disabled, danger, loading }: { children: React.ReactNode; onPress: () => void; disabled?: boolean; danger?: boolean; loading?: boolean }) {
  const blocked = disabled || loading;
  return <Button backgroundColor={danger ? '$danger' : '$brand'} color="$onAccent" borderRadius="$control" minHeight={50} fontSize={16} fontWeight="600" disabled={blocked} opacity={blocked ? 0.55 : 1}
    accessibilityState={{ disabled: !!blocked, busy: !!loading }} pressStyle={{ opacity: 0.78, scale: 0.98 }} onPress={onPress}>
    {loading && <ActivityIndicator size="small" color="white" />}{children}
  </Button>;
}

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: { label: string; onPress: () => void; danger?: boolean }[]; onClose: () => void }) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <Pressable onPress={onClose} accessibilityLabel="关闭操作菜单" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
    <YStack backgroundColor="$panel" padding={20} paddingBottom={32} borderTopLeftRadius="$panel" borderTopRightRadius="$panel" gap={8}>
      <Text color="$color" fontSize={18} fontWeight="600" textAlign="center" marginBottom={8}>{title}</Text>
      {actions.map(action => <PrimaryButton key={action.label} danger={action.danger} onPress={() => { onClose(); action.onPress(); }}>{action.label}</PrimaryButton>)}
      <Button minHeight={48} pressStyle={{ opacity: 0.72 }} onPress={onClose}>取消</Button>
    </YStack>
  </View></Modal>;
}
export function Message({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={14} lineHeight={21}>{children}</Text>; }
