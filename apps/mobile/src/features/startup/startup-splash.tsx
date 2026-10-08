import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { getStartupFrame, getStartupScale } from './startup-motion';
import { playStartupAnimation } from './startup-playback';

const startupIcon = require('../../../assets/adaptive-icon.png');
const INK = '#101010';

export function StartupSplash() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [visible, setVisible] = useState(true);
  const [laidOut, setLaidOut] = useState(false);
  const [presented, setPresented] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const onImageLoaded = useCallback(() => setImageLoaded(true), []);

  useEffect(() => {
    if (!visible || !presented || !laidOut || !imageLoaded) return;
    // Always run the full timeline. Neither OS animation settings nor vault readiness can skip it.
    SplashScreen.hide();
    return playStartupAnimation(
      { requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame },
      setElapsed,
      () => setVisible(false),
    );
  }, [visible, presented, laidOut, imageLoaded]);

  if (!visible) return null;
  const frame = getStartupFrame(elapsed);
  const scale = getStartupScale(windowWidth, windowHeight) * frame.camera;
  const width = frame.width * scale;
  const height = frame.height * scale;
  const radius = frame.radius * scale;
  const handSize = frame.handSize * scale;
  const brandY = frame.brandY + (1 - frame.brandOpacity) * 5;

  return <Modal
    visible
    transparent
    animationType="none"
    presentationStyle="overFullScreen"
    hardwareAccelerated
    statusBarTranslucent
    navigationBarTranslucent
    onShow={() => setPresented(true)}
    onRequestClose={() => {}}>
    <StatusBar style="dark" />
    <View
      testID="startup-splash"
      onLayout={() => setLaidOut(true)}
      accessible
      accessibilityLabel="到点正在启动"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      pointerEvents="auto"
      style={styles.overlay}>
      <View style={[styles.surface, { width, height, borderRadius: radius }]}>
        <View style={[styles.content, { width, height, borderRadius: radius }]}>
          <Image
            source={startupIcon}
            accessible={false}
            resizeMode="contain"
            onLoadEnd={onImageLoaded}
            style={{
              position: 'absolute',
              width: handSize,
              height: handSize,
              left: (width - handSize) / 2 + frame.handX * scale,
              top: (height - handSize) / 2 + frame.handY * scale,
              transform: [{ rotate: `${frame.handAngle}deg` }, { scale: frame.handPress }],
            }}
          />
          <Svg
            width={width}
            height={height}
            viewBox={`${-frame.width / 2} ${-frame.height / 2} ${frame.width} ${frame.height}`}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}>
            <Circle cx={144} cy={-29} r={6 * (0.8 + 0.2 * frame.targetOpacity)} fill={INK} opacity={frame.targetOpacity} />
            <G x={204} y={-2 * (1 - frame.symbolOpacity)} opacity={frame.symbolOpacity}>
              <Path d={frame.symbolPath} fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </G>
            <SvgText x={15} y={(1 - frame.waitingOpacity) * 5} opacity={frame.waitingOpacity}
              fill={INK} fontSize={Math.max(27, 13 / scale)} fontWeight="500" textAnchor="middle" alignmentBaseline="central">正在确认</SvgText>
            <SvgText x={14} y={brandY} opacity={frame.brandOpacity}
              fill={INK} fontSize={47} fontWeight="600" letterSpacing={3} textAnchor="middle" alignmentBaseline="central">到点</SvgText>
            <SvgText x={15} y={29 + (1 - frame.taglineOpacity) * 5} opacity={frame.taglineOpacity}
              fill={INK} fillOpacity={0.58} fontSize={Math.max(16, 12 / scale)} letterSpacing={1.2}
              textAnchor="middle" alignmentBaseline="central">轻点，即到。</SvgText>
          </Svg>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  content: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderColor: '#FAFAFA',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
