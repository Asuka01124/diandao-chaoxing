import React from 'react';
import { Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';
import type { AttemptState } from '@sign/shared';

export function AppScreen({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const theme = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}><YStack flex={1} backgroundColor="$background">
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 42 }} showsVerticalScrollIndicator={false}>
      <YStack marginBottom={24} gap={5}>
        <Text fontSize={34} lineHeight={41} letterSpacing={-0.8} fontWeight="700" color="$color" accessibilityRole="header">{title}</Text>
        {subtitle && <Text fontSize={15} lineHeight={21} color="$muted">{subtitle}</Text>}
      </YStack>
      {children}
    </ScrollView>
    {footer && <YStack backgroundColor="$panel" paddingHorizontal={20} paddingVertical={12} borderTopWidth={1} borderColor="$separator">{footer}</YStack>}
  </YStack></SafeAreaView>;
}
export function SectionTitle({ children }: { children: React.ReactNode }) { return <Text color="$muted" fontSize={12} fontWeight="600" letterSpacing={0.5} marginTop={24} marginBottom={9} marginLeft={14}>{children}</Text>; }
export function GroupedList({ children }: { children: React.ReactNode }) { return <YStack backgroundColor="$panel" borderRadius="$panel" overflow="hidden" borderWidth={1} borderColor="$separator">{children}</YStack>; }
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
const labels: Record<AttemptState, string> = { QUEUED: '排队中', PREFLIGHT: '预检查', SUBMITTING: '提交中', VERIFYING: '核验中', SUCCESS: '成功', ALREADY_SIGNED: '已签到', WAITING_QR: '等待新二维码', WAITING_CAPTCHA: '等待验证码', WAITING_FACE: '等待人脸验证', REAUTH_REQUIRED: '需重新授权', EXPIRED: '已结束', FAILED: '失败' };
export function StatusBadge({ state }: { state: AttemptState }) { return <Text fontSize={12} fontWeight="600" color={state === 'SUCCESS' || state === 'ALREADY_SIGNED' ? '$success' : state === 'FAILED' || state === 'REAUTH_REQUIRED' ? '$danger' : '$brand'}>{labels[state]}</Text>; }
export function AccountAvatar({ name }: { name: string }) { return <YStack width={42} height={42} borderRadius={21} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={18} fontWeight="700">{name.slice(0, 1).toUpperCase()}</Text></YStack>; }
export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <YStack backgroundColor="$soft" borderRadius={22} padding={20} gap={8}>
    <Text color="$brand" fontSize={12} fontWeight="700" letterSpacing={0.8}>{eyebrow}</Text>
    <Text color="$color" fontSize={22} lineHeight={28} fontWeight="700">{title}</Text>
    <Text color="$muted" fontSize={14} lineHeight={21}>{detail}</Text>
    {action && <YStack marginTop={8}>{action}</YStack>}
  </YStack>;
}
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <YStack alignItems="center" justifyContent="center" paddingHorizontal={24} paddingVertical={32} gap={6}>
    <Text color="$color" fontSize={16} fontWeight="600">{title}</Text>
    <Text color="$muted" fontSize={13} lineHeight={19} textAlign="center">{detail}</Text>
  </YStack>;
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
