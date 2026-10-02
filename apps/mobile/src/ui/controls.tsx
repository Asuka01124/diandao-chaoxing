import type React from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { Button, Input, Text, XStack, YStack, useTheme } from 'tamagui';

export function SettingsRow({ title, detail, onPress, onLongPress, accessibilityHint, accessory, symbol, selected }: { title: string; detail?: string; onPress?: () => void; onLongPress?: () => void; accessibilityHint?: string; accessory?: React.ReactNode; symbol?: string; selected?: boolean }) {
  const interactive = !!onPress || !!onLongPress;
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole={interactive ? 'button' : 'text'} accessibilityLabel={`${title}${detail ? `，${detail}` : ''}`} accessibilityHint={accessibilityHint} accessibilityState={interactive ? { selected: !!selected } : undefined}
    accessibilityActions={onLongPress ? [{ name: 'manage', label: '更多操作' }] : undefined}
    onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === 'manage') onLongPress(); } : undefined}
    style={({ pressed }) => ({ opacity: interactive && pressed ? 0.62 : 1 })}>
    <XStack minHeight={69} alignItems="center" justifyContent="space-between" paddingHorizontal={17} borderBottomWidth={0.7} borderColor="$separator" gap={13} backgroundColor={selected ? '$soft' : 'transparent'}>
      {symbol && <YStack width={36} height={36} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text fontSize={16} color="$brand" fontWeight="600">{symbol}</Text></YStack>}
      <YStack flex={1} paddingVertical={13} gap={3}><Text fontSize={15} lineHeight={21} fontWeight="600" color="$color">{title}</Text>{detail && <Text fontSize={12} lineHeight={18} color="$muted" numberOfLines={2}>{detail}</Text>}</YStack>
      {accessory ?? (onPress && <Text color="$muted" fontSize={21} fontWeight="300">›</Text>)}
    </XStack>
  </Pressable>;
}
export function PrimaryButton({ children, onPress, disabled, danger, loading }: { children: string; onPress: () => void; disabled?: boolean; danger?: boolean; loading?: boolean }) {
  const blocked = disabled || loading;
  return <Button backgroundColor={danger ? '$danger' : '$brand'} color="$onAccent" borderRadius={16} minHeight={52} fontSize={15} fontWeight="600" disabled={blocked} opacity={blocked ? 0.55 : 1}
    accessibilityLabel={children} accessibilityState={{ disabled: !!blocked, busy: !!loading }} pressStyle={{ opacity: 0.86, scale: 0.985 }} onPress={onPress}>
    {loading && <ActivityIndicator size="small" color="white" />}{children}
  </Button>;
}

export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title: string; actions: { label: string; onPress: () => void; danger?: boolean }[]; onClose: () => void }) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <Pressable onPress={onClose} accessibilityLabel="关闭操作菜单" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
    <YStack backgroundColor="$panel" overflow="hidden" padding={22} paddingBottom={34} borderTopLeftRadius={24} borderTopRightRadius={24} gap={10}>
      <Text color="$color" fontSize={18} fontWeight="700" textAlign="center" marginBottom={9}>{title}</Text>
      {actions.map(action => <PrimaryButton key={action.label} danger={action.danger} onPress={() => { onClose(); action.onPress(); }}>{action.label}</PrimaryButton>)}
      <Button minHeight={48} backgroundColor="$field" color="$color" borderRadius={16} pressStyle={{ opacity: 0.72 }} onPress={onClose}>取消</Button>
    </YStack>
  </View></Modal>;
}
export function Message({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={14} lineHeight={21}>{children}</Text>; }

export function GlassInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} backgroundColor="$field" color="$color" borderWidth={0} borderRadius={15} minHeight={52}
    paddingHorizontal={16} fontSize={15} focusStyle={{ borderWidth: 1, borderColor: '$brand', backgroundColor: '$panel' }} />;
}
