import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { TabBarIndicator, type Route, type TabBarIndicatorProps } from 'react-native-tab-view';

export type SlidingTabIndicatorProps = Omit<TabBarIndicatorProps<Route>, 'navigationState'> & {
  state: TabBarIndicatorProps<Route>['navigationState'];
  swiping: boolean;
};

export function SlidingTabIndicator({ state, swiping, ...props }: SlidingTabIndicatorProps) {
  const { index, routes } = state;
  const progress = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    // 点击时独立驱动滑块，避免原生分页只上报最终位置时直接跳转。
    // 拖动期间同步选中值，结束后可无缝交还给点击动画。
    if (swiping) {
      progress.setValue(index);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: index,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress, swiping]);

  const position = progress.interpolate({
    inputRange: [0, Math.max(1, routes.length - 1)],
    outputRange: [0, Math.max(1, routes.length - 1)],
    extrapolate: 'clamp',
  });

  return <TabBarIndicator {...props} navigationState={state} position={swiping ? props.position : position} />;
}
