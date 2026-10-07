import { createContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, TextInput, type ScrollView as NativeScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';

export const KeyboardScrollContext = createContext<(() => void) | undefined>(undefined);

export function AppScreen({ title, subtitle, headerAction, children, footer, keyboardAware = false }: { title: string; subtitle?: string; headerAction?: ReactNode; children: ReactNode; footer?: ReactNode; keyboardAware?: boolean }) {
  const theme = useTheme();
  const scroll = useRef<NativeScrollView>(null);
  const focusedInput = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput> | null>(null);
  const scrollY = useRef(0);
  const pendingFrame = useRef<number | null>(null);
  const revealInput = useCallback(() => {
    if (!keyboardAware || !Keyboard.isVisible()) return;
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      const input = focusedInput.current;
      const viewport = scroll.current;
      if (!input || TextInput.State.currentlyFocusedInput() !== input || !viewport || !Keyboard.isVisible()) return;
      // 使用实际滚动区域，兼容窗口缩放、底部导航和不同高度的输入法。
      viewport.getNativeScrollRef()?.measureInWindow((_x, top, _width, height) => {
        input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
          if (TextInput.State.currentlyFocusedInput() !== input || scroll.current !== viewport || !Keyboard.isVisible()) return;
          const bottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? top + height);
          const overflow = inputTop + inputHeight + 16 - bottom;
          const underflow = inputTop - 16 - top;
          if (overflow > 0 || underflow < 0) {
            viewport.scrollTo({ y: Math.max(0, scrollY.current + (overflow > 0 ? overflow : underflow)), animated: false });
          }
        });
      });
    });
  }, [keyboardAware]);
  const onInputFocus = useCallback(() => {
    focusedInput.current = TextInput.State.currentlyFocusedInput();
    revealInput();
  }, [revealInput]);
  useEffect(() => {
    if (!keyboardAware) return;
    const listener = Keyboard.addListener('keyboardDidShow', revealInput);
    return () => {
      listener.remove();
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    };
  }, [keyboardAware, revealInput]);
  return <KeyboardAvoidingView enabled={keyboardAware} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScrollView ref={scroll} flex={1} onLayout={revealInput} onScroll={keyboardAware ? event => { scrollY.current = event.nativeEvent.contentOffset.y; } : undefined} scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 36, paddingBottom: footer ? 30 : 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <KeyboardScrollContext.Provider value={keyboardAware ? onInputFocus : undefined}>
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
        </KeyboardScrollContext.Provider>
      </ScrollView>
      {footer && <YStack backgroundColor="$background" paddingHorizontal={22} paddingTop={13} paddingBottom={12}>
        <YStack width="100%" maxWidth={680} alignSelf="center">{footer}</YStack>
      </YStack>}
    </SafeAreaView>
  </KeyboardAvoidingView>;
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
