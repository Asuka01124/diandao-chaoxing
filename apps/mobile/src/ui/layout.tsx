import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View, type ScrollView as NativeScrollView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack, useTheme } from 'tamagui';

export const TabSafeAreaContext = createContext(false);
export const KeyboardScrollContext = createContext<(() => void) | undefined>(undefined);

export function AppScreen({ title, backLabel, onBack, headerAction, children, footer, keyboardAware = false }: {
  title: string; backLabel?: string; onBack?: () => void; headerAction?: ReactNode; children: ReactNode; footer?: ReactNode; keyboardAware?: boolean;
}) {
  const theme = useTheme();
  const ScreenFrame = useContext(TabSafeAreaContext) ? View : SafeAreaView;
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
    <ScreenFrame style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScrollView ref={scroll} flex={1} onLayout={revealInput} onScroll={keyboardAware ? event => { scrollY.current = event.nativeEvent.contentOffset.y; } : undefined} scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: footer ? 28 : 44 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <KeyboardScrollContext.Provider value={keyboardAware ? onInputFocus : undefined}>
          <YStack width="100%" maxWidth={680} alignSelf="center">
            <YStack marginBottom={10}>
              <XStack minHeight={46} alignItems="center" gap={10}>
                {onBack && <Pressable onPress={onBack} accessibilityRole="button"
                  accessibilityLabel={!backLabel || backLabel === '返回' ? '返回' : `返回${backLabel}`}
                  style={({ pressed }) => ({ minWidth: 44, minHeight: 44, marginLeft: -10, justifyContent: 'center', alignItems: 'center', opacity: pressed ? 0.55 : 1 })}>
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="m15 5-7 7 7 7" stroke={theme.color.val} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                </Pressable>}
                <Text flex={1} accessibilityRole="header" color="$color" fontSize={23} lineHeight={31} fontWeight="500">{title}</Text>
                {headerAction}
              </XStack>
            </YStack>
            {children}
          </YStack>
        </KeyboardScrollContext.Provider>
      </ScrollView>
      {footer && <YStack backgroundColor="$background" paddingHorizontal={20} paddingTop={6} paddingBottom={12}>
        <YStack width="100%" maxWidth={680} alignSelf="center">{footer}</YStack>
      </YStack>}
    </ScreenFrame>
  </KeyboardAvoidingView>;
}

export function SectionTitle({ children, meta, action }: { children: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  return <XStack alignItems="center" marginTop={22} marginBottom={4} gap={8} minHeight={28}>
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path d="M3 6h6l2 3h10v11H3zM3 11h18" stroke={theme.muted.val} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
    <Text flexShrink={1} accessibilityRole="header" color="$muted" fontSize={14} lineHeight={20}>{children}</Text>
    {meta != null && <Text color="$muted" fontSize={14}>{meta}</Text>}
    {action && <XStack marginLeft="auto">{action}</XStack>}
  </XStack>;
}

export function GroupedList({ children }: { children: ReactNode }) {
  return <YStack>{children}</YStack>;
}

export function HeroCard({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <YStack backgroundColor="$panel" borderRadius={20} padding={20} justifyContent="center" gap={6}
    shadowColor="#000000" shadowOpacity={0.04} shadowRadius={14} shadowOffset={{ width: 0, height: 4 }} elevation={2}>
    <Text color="$muted" fontSize={14} fontWeight="500">{eyebrow}</Text>
    <Text color="$color" fontSize={22} lineHeight={29} fontWeight="500" letterSpacing={-0.4}>{title}</Text>
    {!!detail && <Text color="$muted" fontSize={14} lineHeight={20}>{detail}</Text>}
    {action && <YStack marginTop={6}>{action}</YStack>}
  </YStack>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return <YStack paddingLeft={24} paddingVertical={16} gap={6}>
    <Text color="$color" fontSize={15} fontWeight="500">{title}</Text>
    {!!detail && <Text color="$muted" fontSize={14} lineHeight={18}>{detail}</Text>}
  </YStack>;
}
