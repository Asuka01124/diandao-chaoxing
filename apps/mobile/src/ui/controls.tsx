import { useContext } from 'react';
import type React from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { Button, Input, Text, XStack, YStack, useTheme } from 'tamagui';
import { KeyboardScrollContext } from './layout';

export function SettingsRow({ title, detail, onPress, onLongPress, accessibilityHint, accessory, symbol, indexLabel, badge, selected, last = false }: {
  title: string; detail?: string; onPress?: () => void; onLongPress?: () => void; accessibilityHint?: string; accessory?: React.ReactNode; symbol?: string; indexLabel?: string; badge?: string; selected?: boolean; last?: boolean;
}) {
  const interactive = !!onPress || !!onLongPress;
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole={interactive ? 'button' : 'text'} accessibilityLabel={`${title}${detail ? `，${detail}` : ''}`} accessibilityHint={accessibilityHint} accessibilityState={interactive ? { selected: !!selected } : undefined}
    accessibilityActions={onLongPress ? [{ name: 'manage', label: '更多操作' }] : undefined}
    onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === 'manage') onLongPress(); } : undefined}
    style={({ pressed }) => ({ opacity: interactive && pressed ? 0.62 : 1 })}>
    <XStack minHeight={64} alignItems="center" justifyContent="space-between" paddingHorizontal={17} borderBottomWidth={last ? 0 : 0.7} borderColor="$separator" gap={13} backgroundColor={selected ? '$soft' : 'transparent'}>
      {indexLabel ? <Text width={22} fontSize={12} color="$muted" fontWeight="500">{indexLabel}</Text>
        : symbol && <YStack width={34} height={34} borderRadius={11} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text fontSize={14} color="$brand" fontWeight="600">{symbol}</Text></YStack>}
      <YStack flex={1} paddingVertical={12} gap={3}>
        <XStack alignItems="center" gap={7}>
          <Text fontSize={15} lineHeight={21} fontWeight="500" color="$color">{title}</Text>
          {!!badge && <YStack backgroundColor="$soft" paddingHorizontal={6} paddingVertical={2} borderRadius={5}><Text fontSize={12} lineHeight={16} color="$muted">{badge}</Text></YStack>}
        </XStack>
        {detail && <Text fontSize={12} lineHeight={18} color="$muted" numberOfLines={2}>{detail}</Text>}
      </YStack>
      {accessory ?? (onPress && <Text color="$muted" fontSize={20} fontWeight="300">›</Text>)}
    </XStack>
  </Pressable>;
}

export function PrimaryButton({ children, onPress, disabled, danger, variant = 'primary', loading }: {
  children: string; onPress: () => void; disabled?: boolean; danger?: boolean; variant?: 'primary' | 'secondary'; loading?: boolean;
}) {
  const blocked = disabled || loading;
  const theme = useTheme();
  const isSecondary = variant === 'secondary' && !danger;
  const bg = danger ? '$dangerSoft' : isSecondary ? '$secondarySurface' : '$actionSurface';
  const fg = danger ? '$danger' : isSecondary ? '$secondaryText' : '$actionText';
  const spinnerColor = danger ? theme.danger.val : isSecondary ? theme.secondaryText.val : theme.actionText.val;
  return <Button backgroundColor={bg} color={fg}
    borderWidth={isSecondary ? 1 : 0} borderColor={isSecondary ? '$secondaryBorder' : 'transparent'} borderRadius={18} minHeight={isSecondary ? 48 : 54} fontSize={15} fontWeight="500"
    shadowColor="#000000" shadowOpacity={danger || isSecondary ? 0 : 0.08} shadowRadius={12} shadowOffset={{ width: 0, height: 4 }} elevation={danger || isSecondary ? 0 : 2}
    disabled={blocked} opacity={blocked ? 0.45 : 1}
    accessibilityLabel={children} accessibilityState={{ disabled: !!blocked, busy: !!loading }} pressStyle={{ opacity: 0.72, scale: 0.988 }} onPress={onPress}>
    {loading && <ActivityIndicator size="small" color={spinnerColor} />}{children}
  </Button>;
}

export function ActionSheet({ visible, title, subtitle, actions, onClose }: {
  visible: boolean; title: string; subtitle?: string; actions: { label: string; onPress: () => void; danger?: boolean }[]; onClose: () => void;
}) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <Pressable onPress={onClose} accessibilityLabel="关闭操作菜单" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
    <YStack backgroundColor="$panel" overflow="hidden" padding={22} paddingBottom={34} borderTopLeftRadius={24} borderTopRightRadius={24} gap={10}>
      <YStack alignItems="center" marginBottom={6} gap={3}>
        <Text color="$color" fontSize={16} fontWeight="500" textAlign="center">{title}</Text>
        {!!subtitle && <Text color="$muted" fontSize={12} textAlign="center">{subtitle}</Text>}
      </YStack>
      {actions.map(action => <PrimaryButton key={action.label} variant={action.danger ? 'primary' : 'secondary'} danger={action.danger} onPress={() => { onClose(); action.onPress(); }}>{action.label}</PrimaryButton>)}
      <Button minHeight={44} backgroundColor="$soft" color="$muted" borderRadius={14} fontSize={13} fontWeight="500" pressStyle={{ opacity: 0.72 }} onPress={onClose}>关闭</Button>
    </YStack>
  </View></Modal>;
}

export function Message({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={13} lineHeight={20}>{children}</Text>; }

export function GlassInput(props: React.ComponentProps<typeof Input>) {
  const revealInput = useContext(KeyboardScrollContext);
  return <Input {...props} onFocus={event => { props.onFocus?.(event); revealInput?.(); }} backgroundColor="$field" color="$color" borderWidth={1} borderColor="$fieldBorder" borderRadius={14} minHeight={48}
    paddingHorizontal={16} fontSize={14} focusStyle={{ borderWidth: 1.5, borderColor: '$color', backgroundColor: '$panel' }} />;
}
