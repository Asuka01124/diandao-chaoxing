import type React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, YStack, useTheme } from 'tamagui';

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

export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <YStack backgroundColor="$soft" borderRadius={22} padding={20} gap={8}>
    <Text color="$brand" fontSize={12} fontWeight="700" letterSpacing={0.8}>{eyebrow}</Text>
    <Text color="$color" fontSize={22} lineHeight={28} fontWeight="700">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={14} lineHeight={21}>{detail}</Text>}
    {action && <YStack marginTop={8}>{action}</YStack>}
  </YStack>;
}
export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <YStack alignItems="center" justifyContent="center" paddingHorizontal={24} paddingVertical={32} gap={6}>
    <Text color="$color" fontSize={16} fontWeight="600">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={13} lineHeight={19} textAlign="center">{detail}</Text>}
  </YStack>;
}
