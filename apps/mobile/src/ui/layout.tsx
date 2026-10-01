import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { View, type View as NativeView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurTargetView, BlurView } from 'expo-blur';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ScrollView, Text, XStack, YStack, useTheme, useThemeName } from 'tamagui';

const BlurContext = createContext<RefObject<NativeView | null> | null>(null);

function AmbientBackground({ dark }: { dark: boolean }) {
  return <Svg width="100%" height="100%" style={{ position: 'absolute' }} pointerEvents="none">
    <Defs>
      <LinearGradient id="canvas" x1="0" x2="1" y1="0" y2="1">
        <Stop offset="0" stopColor={dark ? '#080F21' : '#F5F8FF'} />
        <Stop offset="0.55" stopColor={dark ? '#111B36' : '#EAF0FC'} />
        <Stop offset="1" stopColor={dark ? '#0A1228' : '#E5EAF7'} />
      </LinearGradient>
      <RadialGradient id="haloOne" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={dark ? '#4262B8' : '#A9C1FF'} stopOpacity={dark ? 0.37 : 0.51} />
        <Stop offset="1" stopColor={dark ? '#4262B8' : '#A9C1FF'} stopOpacity="0" />
      </RadialGradient>
      <RadialGradient id="haloTwo" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={dark ? '#6B5CA4' : '#D7C9FF'} stopOpacity={dark ? 0.24 : 0.47} />
        <Stop offset="1" stopColor={dark ? '#6B5CA4' : '#D7C9FF'} stopOpacity="0" />
      </RadialGradient>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#canvas)" />
    <Rect x="-28%" y="-13%" width="118%" height="47%" fill="url(#haloOne)" />
    <Rect x="34%" y="59%" width="94%" height="42%" fill="url(#haloTwo)" />
  </Svg>;
}

export function FrostedBackdrop({ intensity = 36 }: { intensity?: number }) {
  const target = useContext(BlurContext);
  const dark = useThemeName() === 'dark';
  return <BlurView
    blurTarget={target ?? undefined}
    blurMethod={target ? 'dimezisBlurViewSdk31Plus' : 'none'}
    intensity={intensity}
    tint={dark ? 'dark' : 'light'}
    pointerEvents="none"
    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
  />;
}

export function AppScreen({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const theme = useTheme();
  const dark = useThemeName() === 'dark';
  const backgroundRef = useRef<NativeView | null>(null);
  return <BlurContext.Provider value={backgroundRef}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <BlurTargetView ref={backgroundRef} pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
        <AmbientBackground dark={dark} />
      </BlurTargetView>
      <YStack flex={1}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 25, paddingBottom: footer ? 30 : 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <YStack width="100%" maxWidth={680} alignSelf="center">
          <YStack marginBottom={30} gap={8}>
            <XStack alignItems="center" gap={8} marginBottom={6}>
              <YStack width={18} height={2} borderRadius={2} backgroundColor="$brand" />
              <Text color="$brand" fontSize={11} fontWeight="700" letterSpacing={1.4}>点卯侠  /  专注每一次签到</Text>
            </XStack>
            <Text fontSize={34} lineHeight={43} letterSpacing={-0.8} fontWeight="700" color="$color" accessibilityRole="header">{title}</Text>
            {subtitle && <Text fontSize={14} lineHeight={22} color="$muted">{subtitle}</Text>}
          </YStack>
          {children}
          </YStack>
        </ScrollView>
        {footer && <YStack overflow="hidden" borderTopWidth={1} borderColor="$glassBorder" backgroundColor="$panel" paddingHorizontal={22} paddingTop={13} paddingBottom={12}>
          <FrostedBackdrop intensity={48} />
          <YStack width="100%" maxWidth={680} alignSelf="center">{footer}</YStack>
        </YStack>}
      </YStack>
    </SafeAreaView>
  </BlurContext.Provider>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <XStack alignItems="center" gap={9} marginTop={28} marginBottom={12} marginLeft={4}>
    <YStack width={5} height={5} borderRadius={3} backgroundColor="$brand" />
    <Text color="$muted" fontSize={12} fontWeight="700" letterSpacing={1.5}>{children}</Text>
  </XStack>;
}

export function GroupedList({ children }: { children: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius="$panel" overflow="hidden" borderWidth={1} borderColor="$glassBorder"
    shadowColor="#273960" shadowOpacity={0.07} shadowRadius={18} shadowOffset={{ width: 0, height: 8 }} elevation={2}>
    <FrostedBackdrop intensity={22} />
    {children}
  </YStack>;
}

export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <YStack overflow="hidden" backgroundColor="$panel" borderWidth={1} borderColor="$glassBorder" borderRadius={28}
    padding={24} minHeight={157} justifyContent="center" gap={9} shadowColor="#233968" shadowOpacity={0.11} shadowRadius={24} shadowOffset={{ width: 0, height: 12 }} elevation={3}>
    <FrostedBackdrop intensity={40} />
    <View pointerEvents="none" style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -82, right: -34, backgroundColor: '#8CA8FF29', borderWidth: 1, borderColor: '#FFFFFF55' }} />
    <View pointerEvents="none" style={{ position: 'absolute', width: 94, height: 94, borderRadius: 47, right: 24, bottom: -67, backgroundColor: '#B5A3FF20' }} />
    <Text color="$brand" fontSize={11} fontWeight="700" letterSpacing={2.1}>{eyebrow}</Text>
    <Text color="$color" fontSize={24} lineHeight={31} letterSpacing={-0.4} fontWeight="700">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={14} lineHeight={22} maxWidth={300}>{detail}</Text>}
    {action && <YStack marginTop={8}>{action}</YStack>}
  </YStack>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <YStack alignItems="center" justifyContent="center" paddingHorizontal={26} paddingVertical={42} gap={8}>
    <YStack width={40} height={40} borderRadius={20} backgroundColor="$soft" borderWidth={1} borderColor="$glassBorder" alignItems="center" justifyContent="center" marginBottom={6}>
      <YStack width={10} height={10} borderRadius={5} backgroundColor="$brand" opacity={0.75} />
    </YStack>
    <Text color="$color" fontSize={16} fontWeight="600">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={13} lineHeight={20} textAlign="center">{detail}</Text>}
  </YStack>;
}
