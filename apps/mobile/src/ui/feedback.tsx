import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Text, XStack, useTheme } from 'tamagui';

export type FeedbackTone = 'loading' | 'success' | 'error' | 'info';
type Feedback = { pathname: string; id: number; message: string; tone: FeedbackTone };
type Notify = (message: string, tone?: FeedbackTone) => void;

const FeedbackContext = createContext<Notify>(() => {});

export function FeedbackNotice({ message, tone = 'info', floating = false }: { message: string; tone?: FeedbackTone; floating?: boolean }) {
  const theme = useTheme();
  const accent = tone === 'error' ? theme.danger.val : tone === 'success' ? theme.success.val : theme.brand.val;
  return <XStack minHeight={44} alignItems="center" gap={10} paddingHorizontal={floating ? 16 : 4} paddingVertical={8} backgroundColor={floating ? '$panel' : 'transparent'} borderRadius={floating ? 24 : 0}
    shadowColor="#000000" shadowOpacity={floating ? 0.06 : 0} shadowRadius={16} shadowOffset={{ width: 0, height: 6 }} elevation={floating ? 3 : 0}
    accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
    {tone === 'loading'
      ? <ActivityIndicator size="small" color={accent} />
      : <Text color={tone === 'error' ? '$danger' : tone === 'success' ? '$success' : '$muted'} fontSize={14} fontWeight="600">
        {tone === 'error' ? '!' : tone === 'success' ? '✓' : '•'}
      </Text>}
    <Text flexShrink={1} color="$color" fontSize={14} lineHeight={21} fontWeight="500">{message}</Text>
  </XStack>;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    currentPath.current = pathname;
    setFeedback(current => current?.pathname === pathname ? current : null);
  }, [pathname]);
  const notify = useCallback<Notify>((message, tone = 'info') => {
    if (currentPath.current !== pathname) return;
    if (timer.current) clearTimeout(timer.current);
    const id = ++nextId.current;
    setFeedback({ pathname, id, message, tone });
    if (tone !== 'loading') timer.current = setTimeout(() => setFeedback(current => current?.id === id ? null : current), tone === 'error' ? 4500 : 2400);
  }, [pathname]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <FeedbackContext.Provider value={notify}>
    {children}
    {feedback?.pathname === pathname && <View pointerEvents="none" style={{ position: 'absolute', top: 52, left: 22, right: 22, alignItems: 'center', zIndex: 200, elevation: 20 }}>
      <FeedbackNotice floating message={feedback.message} tone={feedback.tone} />
    </View>}
  </FeedbackContext.Provider>;
}

export function useFeedback(): Notify { return useContext(FeedbackContext); }
