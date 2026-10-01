import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text, XStack, useTheme } from 'tamagui';

export type FeedbackTone = 'loading' | 'success' | 'error' | 'info';
type Feedback = { id: number; message: string; tone: FeedbackTone };
type Notify = (message: string, tone?: FeedbackTone) => void;

const FeedbackContext = createContext<Notify>(() => {});

export function FeedbackNotice({ message, tone = 'info' }: { message: string; tone?: FeedbackTone }) {
  const theme = useTheme();
  const accent = tone === 'error' ? theme.danger.val : tone === 'success' ? theme.success.val : theme.brand.val;
  return <XStack minHeight={46} alignItems="center" gap={10} paddingHorizontal={14} paddingVertical={10} backgroundColor="$panel" borderWidth={1} borderColor="$separator" borderRadius={14}
    accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
    {tone === 'loading' ? <ActivityIndicator size="small" color={accent} /> : <Text width={19} color={tone === 'error' ? '$danger' : tone === 'success' ? '$success' : '$brand'} fontSize={18} fontWeight="700" textAlign="center">{tone === 'error' ? '!' : tone === 'success' ? '✓' : '•'}</Text>}
    <Text flex={1} color="$color" fontSize={14} lineHeight={20}>{message}</Text>
  </XStack>;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback<Notify>((message, tone = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++nextId.current;
    setFeedback({ id, message, tone });
    if (tone !== 'loading') timer.current = setTimeout(() => setFeedback(current => current?.id === id ? null : current), tone === 'error' ? 5000 : 3200);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <FeedbackContext.Provider value={notify}>
    {children}
    {feedback && <View pointerEvents="none" style={{ position: 'absolute', top: 58, left: 18, right: 18, zIndex: 200, elevation: 20 }}>
      <FeedbackNotice message={feedback.message} tone={feedback.tone} />
    </View>}
  </FeedbackContext.Provider>;
}

export function useFeedback(): Notify { return useContext(FeedbackContext); }
