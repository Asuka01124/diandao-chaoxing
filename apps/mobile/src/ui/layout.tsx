import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';

export function AppScreen({ title, subtitle, headerAction, children, footer }: { title: string; subtitle?: string; headerAction?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const theme = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
    <YStack flex={1}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 36, paddingBottom: footer ? 30 : 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <YStack width="100%" maxWidth={680} alignSelf="center">
          <YStack marginBottom={34} gap={8}>
            {headerAction ? <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
              <Text flex={1} fontSize={36} lineHeight={46} letterSpacing={-0.7} fontWeight="500" color="$color" accessibilityRole="header">{title}</Text>
              {headerAction}
            </XStack> : <Text fontSize={36} lineHeight={46} letterSpacing={-0.7} fontWeight="500" color="$color" accessibilityRole="header">{title}</Text>}
            {subtitle && <Text fontSize={15} lineHeight={23} color="$muted">{subtitle}</Text>}
          </YStack>
          {children}
        </YStack>
      </ScrollView>
      {footer && <YStack backgroundColor="$panel" paddingHorizontal={22} paddingTop={13} paddingBottom={12}>
        <YStack width="100%" maxWidth={680} alignSelf="center">{footer}</YStack>
      </YStack>}
    </YStack>
  </SafeAreaView>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text color="$muted" fontSize={14} lineHeight={21} marginTop={28} marginBottom={12} marginLeft={4}>{children}</Text>;
}

export function GroupedList({ children }: { children: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius={20} overflow="hidden"
    shadowColor="#000000" shadowOpacity={0.045} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    {children}
  </YStack>;
}

export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius={20} padding={24} minHeight={148} justifyContent="center" gap={9}
    shadowColor="#000000" shadowOpacity={0.045} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    <Text color="$muted" fontSize={13}>{eyebrow}</Text>
    <Text color="$color" fontSize={24} lineHeight={31} fontWeight="600">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={14} lineHeight={22}>{detail}</Text>}
    {action && <YStack marginTop={8}>{action}</YStack>}
  </YStack>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <YStack alignItems="center" justifyContent="center" paddingHorizontal={26} paddingVertical={42} gap={8}>
    <Text color="$color" fontSize={16} fontWeight="600">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={13} lineHeight={20} textAlign="center">{detail}</Text>}
  </YStack>;
}
