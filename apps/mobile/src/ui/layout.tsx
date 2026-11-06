import { createContext, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, type ScrollView as NativeScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';

export const KeyboardScrollContext = createContext<(() => void) | undefined>(undefined);

export function AppScreen({ title, subtitle, backLabel, onBack, headerAction, children, footer, keyboardAware = false }: {
  title: string; subtitle?: string; backLabel?: string; onBack?: () => void; headerAction?: ReactNode; children: ReactNode; footer?: ReactNode; keyboardAware?: boolean;
}) {
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
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: onBack ? 18 : 28, paddingBottom: footer ? 28 : 44 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <KeyboardScrollContext.Provider value={keyboardAware ? onInputFocus : undefined}>
          <YStack width="100%" maxWidth={680} alignSelf="center">
            {onBack && <XStack alignItems="center" justifyContent="space-between" marginBottom={14}>
              <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={backLabel ? `返回${backLabel}` : '返回'}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 12, opacity: pressed ? 0.55 : 1 })}>
                <Text color="$muted" fontSize={18} lineHeight={20} fontWeight="400">‹</Text>
                <Text color="$muted" fontSize={13} lineHeight={18} fontWeight="500">{backLabel || '返回'}</Text>
              </Pressable>
              {headerAction}
            </XStack>}
            <YStack marginBottom={24} gap={6}>
              {!onBack && headerAction ? <XStack alignItems="center" justifyContent="space-between" gap={12}>
                <Text flex={1} fontSize={32} lineHeight={40} letterSpacing={-0.7} fontWeight="500" color="$color" accessibilityRole="header">{title}</Text>
                {headerAction}
              </XStack> : <Text fontSize={onBack ? 28 : 32} lineHeight={onBack ? 36 : 40} letterSpacing={-0.6} fontWeight="500" color="$color" accessibilityRole="header">{title}</Text>}
              {subtitle && <Text fontSize={13} lineHeight={20} color="$muted">{subtitle}</Text>}
            </YStack>
            {children}
          </YStack>
        </KeyboardScrollContext.Provider>
      </ScrollView>
      {footer && <YStack backgroundColor="$background" borderTopWidth={1} borderColor="$separator" paddingHorizontal={22} paddingTop={12} paddingBottom={14}>
        <YStack width="100%" maxWidth={680} alignSelf="center">{footer}</YStack>
      </YStack>}
    </SafeAreaView>
  </KeyboardAvoidingView>;
}

export function SectionTitle({ children, meta, action }: { children: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return <XStack alignItems="center" justifyContent="space-between" marginTop={22} marginBottom={10} paddingHorizontal={4}>
    <Text color="$muted" fontSize={12} lineHeight={18} fontWeight="500">{children}</Text>
    {action ?? (meta !== undefined && <Text color="$muted" fontSize={12} lineHeight={18}>{meta}</Text>)}
  </XStack>;
}

export function GroupedList({ children }: { children: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius={20} overflow="hidden"
    shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    {children}
  </YStack>;
}

export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius={20} padding={20} justifyContent="center" gap={6}
    shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    <Text color="$muted" fontSize={12} fontWeight="500">{eyebrow}</Text>
    <Text color="$color" fontSize={22} lineHeight={29} fontWeight="500" letterSpacing={-0.4}>{title}</Text>
    {!!detail && <Text color="$muted" fontSize={13} lineHeight={20}>{detail}</Text>}
    {action && <YStack marginTop={6}>{action}</YStack>}
  </YStack>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <YStack alignItems="center" justifyContent="center" paddingHorizontal={24} paddingVertical={36} gap={6}>
    <Text color="$color" fontSize={15} fontWeight="500">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={12} lineHeight={18} textAlign="center">{detail}</Text>}
  </YStack>;
}
