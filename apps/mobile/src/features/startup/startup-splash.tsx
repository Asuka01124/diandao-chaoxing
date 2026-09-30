import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { useVault } from '../../state';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const ink = '#111111';

export function StartupSplash() {
  const { ready } = useVault();
  const [visible, setVisible] = useState(true);
  const [finished, setFinished] = useState(false);
  const nativeHidden = useRef(false);
  const outline = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const title = useRef(new Animated.Value(0)).current;
  const overlay = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let active = true;
    let sequence: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (!active) return;
      if (reduced) {
        outline.setValue(1); check.setValue(1);
        dots.forEach(dot => dot.setValue(1)); title.setValue(1);
        setFinished(true);
        return;
      }
      const timing = (value: Animated.Value, duration: number) => Animated.timing(value, {
        toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false,
      });
      sequence = Animated.sequence([
        timing(outline, 420),
        Animated.parallel([timing(check, 240), timing(title, 240)]),
        Animated.stagger(65, dots.map(dot => timing(dot, 150))),
      ]);
      sequence.start(({ finished: completed }) => { if (active && completed) setFinished(true); });
    }).catch(() => {
      if (!active) return;
      outline.setValue(1); check.setValue(1);
      dots.forEach(dot => dot.setValue(1)); title.setValue(1);
      setFinished(true);
    });
    return () => { active = false; sequence?.stop(); };
  }, [outline, check, dots, title]);

  useEffect(() => {
    if (!ready || !finished) return;
    const fade = Animated.timing(overlay, { toValue: 0, duration: 160, useNativeDriver: true });
    fade.start(({ finished: completed }) => { if (completed) setVisible(false); });
    return () => fade.stop();
  }, [ready, finished, overlay]);

  if (!visible) return null;
  const reveal = (length: number) => outline.interpolate({ inputRange: [0, 1], outputRange: [length, 0] });
  return <Animated.View
    onLayout={() => {
      if (nativeHidden.current) return;
      nativeHidden.current = true;
      void SplashScreen.hideAsync().catch(() => {});
    }}
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, backgroundColor: '#ffffff', opacity: overlay, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 224, height: 224 }}>
      <Svg width="100%" height="100%" viewBox="0 0 1024 1024" fill="none">
        <AnimatedRect x={205} y={238} width={614} height={584} rx={116} stroke={ink} strokeWidth={38} strokeDasharray={[2400]} strokeDashoffset={reveal(2400)} />
        <AnimatedPath d="M205 380h614" stroke={ink} strokeWidth={38} strokeLinecap="round" strokeDasharray={[614]} strokeDashoffset={reveal(614)} />
        <AnimatedPath d="M358 198v107M666 198v107" stroke={ink} strokeWidth={38} strokeLinecap="round" strokeDasharray={[107]} strokeDashoffset={reveal(107)} />
        <AnimatedCircle cx={512} cy={572} r={142} stroke={ink} strokeWidth={38} strokeDasharray={[900]} strokeDashoffset={reveal(900)} />
        <AnimatedPath d="m440 573 49 49 99-105" stroke={ink} strokeWidth={38} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={[220]} strokeDashoffset={check.interpolate({ inputRange: [0, 1], outputRange: [220, 0] })} />
        {[355, 512, 669].map((cx, index) => <AnimatedCircle key={cx} cx={cx} cy={753} r={16} fill={ink} opacity={dots[index]} />)}
      </Svg>
    </View>
    <Animated.Text style={{ marginTop: 22, color: ink, fontSize: 27, fontWeight: '700', letterSpacing: 2, opacity: title }}>点卯侠</Animated.Text>
  </Animated.View>;
}
