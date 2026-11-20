import { useContext } from 'react';
import type React from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Input, Text, XStack, YStack, useTheme } from 'tamagui';
import { KeyboardScrollContext } from './layout';

export function SettingsRow({ title, detail, onPress, onLongPress, accessibilityHint, accessory, selected, value }: {
  title: string; detail?: string; onPress?: () => void; onLongPress?: () => void; accessibilityHint?: string; accessory?: React.ReactNode; value?: string; selected?: boolean; last?: boolean;
}) {
  const interactive = !!onPress || !!onLongPress;
  return <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole={interactive ? 'button' : 'text'} accessibilityLabel={`${title}${detail ? `，${detail}` : ''}`} accessibilityValue={value ? { text: value } : undefined} accessibilityHint={accessibilityHint} accessibilityState={interactive ? { selected: !!selected } : undefined}
    accessibilityActions={onLongPress ? [{ name: 'manage', label: '更多操作' }] : undefined}
    onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === 'manage') onLongPress(); } : undefined}
    style={({ pressed }) => ({ opacity: interactive && pressed ? 0.62 : 1 })}>
    <XStack minHeight={50} alignItems="center" paddingLeft={7} paddingRight={2} gap={14}>
      <YStack width={6} height={6} borderRadius={3} backgroundColor={selected ? '$focusDot' : '$idleDot'} />
      <YStack flex={1} paddingVertical={9} gap={3}>
        <XStack alignItems="center" gap={7}>
          <Text flexShrink={1} fontSize={16} lineHeight={23} fontWeight="400" color="$color">{title}</Text>
        </XStack>
        {detail && <Text fontSize={14} lineHeight={20} color="$muted" numberOfLines={2}>{detail}</Text>}
      </YStack>
      {value && <Text color="$muted" fontSize={14}>{value}</Text>}
      {accessory ?? (!value && onPress && <Text color="$muted" fontSize={20} fontWeight="300">›</Text>)}
    </XStack>
  </Pressable>;
}

export function PrimaryButton({ children, onPress, disabled, danger, variant = 'primary', loading }: {
  children: string; onPress: () => void; disabled?: boolean; danger?: boolean; variant?: 'primary' | 'secondary' | 'dock'; loading?: boolean;
}) {
  const blocked = disabled || loading;
  const theme = useTheme();
  const isSecondary = variant === 'secondary' && !danger;
  const bg = danger ? '$dangerSoft' : isSecondary ? '$secondarySurface' : '$actionSurface';
  const fg = danger ? '$danger' : isSecondary ? '$secondaryText' : '$actionText';
  const spinnerColor = danger ? theme.danger.val : isSecondary ? theme.secondaryText.val : theme.actionText.val;
  if (variant === 'dock') return <Pressable onPress={onPress} disabled={blocked} accessibilityRole="button"
    accessibilityLabel={children} accessibilityState={{ disabled: !!blocked, busy: !!loading }}
    style={({ pressed }) => ({ opacity: blocked ? 0.55 : pressed ? 0.75 : 1, borderRadius: 32, backgroundColor: theme.panel.val,
      shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 })}>
    <XStack minHeight={54} alignItems="center" gap={10} paddingLeft={20} paddingRight={6} paddingVertical={5}>
      <Text flex={1} color="$color" fontSize={16}>{children}</Text>
      <YStack width={42} height={42} borderRadius={21} backgroundColor="$actionSurface" alignItems="center" justifyContent="center">
        {loading ? <ActivityIndicator color={theme.actionText.val} /> : <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path d="M4 12h15m-6-6 6 6-6 6" stroke={theme.actionText.val} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>}
      </YStack>
    </XStack>
  </Pressable>;
  return <Button backgroundColor={bg} color={fg}
    borderWidth={0} borderRadius={24} minHeight={46} fontSize={15} fontWeight="500"
    disabled={blocked} opacity={blocked ? 0.45 : 1}
    accessibilityLabel={children} accessibilityState={{ disabled: !!blocked, busy: !!loading }} pressStyle={{ backgroundColor: bg, opacity: 0.72 }} onPress={onPress}>
    {loading && <ActivityIndicator size="small" color={spinnerColor} />}{children}
  </Button>;
}

export function ActionSheet({ visible, title, subtitle, actions, onClose, embedded = false, closeOnPress = true }: {
  visible: boolean; title: string; subtitle?: string; embedded?: boolean; closeOnPress?: boolean; actions: { label: string; onPress: () => void; danger?: boolean }[]; onClose: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;
  const content = <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
    <Pressable onPress={onClose} accessibilityLabel="关闭操作菜单" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.overlay.val }} />
    <YStack width="100%" maxWidth={340} alignSelf="center" backgroundColor="$panel" overflow="hidden" padding={22} borderRadius={24} gap={10}>
      <YStack alignItems="center" marginBottom={6} gap={3}>
        <Text color="$color" fontSize={16} fontWeight="500" textAlign="center">{title}</Text>
        {!!subtitle && <Text color="$muted" fontSize={14} textAlign="center">{subtitle}</Text>}
      </YStack>
      {actions.map(action => <Pressable key={action.label} accessibilityRole="button" onPress={() => { if (closeOnPress) onClose(); action.onPress(); }}
        style={({ pressed }) => ({ minHeight: 46, justifyContent: 'center', opacity: pressed ? 0.55 : 1 })}>
        <Text color={action.danger ? '$danger' : '$color'} fontSize={16}>{action.label}</Text>
      </Pressable>)}
      <Button minHeight={44} backgroundColor="$soft" color="$muted" borderRadius={14} fontSize={14} fontWeight="500" pressStyle={{ opacity: 0.72 }} onPress={onClose}>关闭</Button>
    </YStack>
  </View>;
  return embedded ? content : <Modal visible transparent animationType="fade" onRequestClose={onClose}>{content}</Modal>;
}

export function Message({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={14} lineHeight={21}>{children}</Text>; }

export function GlassInput(props: React.ComponentProps<typeof Input>) {
  const revealInput = useContext(KeyboardScrollContext);
  return <Input {...props} onFocus={event => { props.onFocus?.(event); revealInput?.(); }} backgroundColor="$field" color="$color" borderWidth={0} borderRadius={12} minHeight={48}
    paddingHorizontal={16} fontSize={14} focusStyle={{ backgroundColor: '$panel', borderWidth: 1, borderColor: '$muted' }} />;
}
