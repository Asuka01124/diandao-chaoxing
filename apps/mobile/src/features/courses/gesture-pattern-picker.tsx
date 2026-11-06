import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';

const CELL = 80;
const SIZE = CELL * 3;

function center(digit: string): { x: number; y: number } {
  const index = Number(digit) - 1;
  return { x: (index % 3) * CELL + CELL / 2, y: Math.floor(index / 3) * CELL + CELL / 2 };
}

export function GesturePatternPicker({ value, onChange }: { value: string; onChange: (sequence: string) => void }) {
  const theme = useTheme();
  const line = value.split('').map((digit, index) => {
    const point = center(digit);
    return `${index ? 'L' : 'M'} ${point.x} ${point.y}`;
  }).join(' ');

  return <YStack gap={12}>
    <View style={{ width: SIZE, height: SIZE, alignSelf: 'center', backgroundColor: theme.panel.val, borderRadius: 20 }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d={line} fill="none" stroke={theme.brand.val} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      {Array.from({ length: 9 }, (_, index) => {
        const digit = String(index + 1);
        const order = value.indexOf(digit) + 1;
        const selected = order > 0;
        return <Pressable key={digit} accessibilityRole="button" accessibilityLabel={`圆点 ${digit}${selected ? `，第 ${order} 步` : ''}`}
          accessibilityState={{ selected }} onPress={() => { if (!selected) onChange(value + digit); }}
          style={({ pressed }) => ({ position: 'absolute', left: (index % 3) * CELL, top: Math.floor(index / 3) * CELL,
            width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.68 : 1 })}>
          <View style={{ width: 48, height: 48, borderRadius: 24,
            backgroundColor: selected ? theme.actionSurface.val : theme.soft.val, alignItems: 'center', justifyContent: 'center' }}>
            <Text color={selected ? '$actionText' : '$muted'} fontSize={15} fontWeight="500">{digit}</Text>
          </View>
          {selected && <View style={{ position: 'absolute', right: 8, top: 8, minWidth: 20, height: 20, borderRadius: 10,
            backgroundColor: theme.panel.val, borderWidth: 1, borderColor: theme.separator.val, alignItems: 'center', justifyContent: 'center' }}>
            <Text color="$color" fontSize={12} fontWeight="600">{order}</Text>
          </View>}
        </Pressable>;
      })}
    </View>
    <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={4}>
      <Text color={value.length >= 4 ? '$color' : '$muted'} fontSize={12}>
        {value.length ? `已连 ${value.split('').join(' · ')}${value.length < 4 ? `（还需 ${4 - value.length} 个）` : ''}` : '按顺序点击至少 4 个圆点'}
      </Text>
      {!!value && <XStack gap={12}>
        <Pressable accessibilityRole="button" accessibilityLabel="撤销上一步" onPress={() => onChange(value.slice(0, -1))} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
          <Text color="$muted" fontSize={12} fontWeight="500">撤销</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="重新选择手势" onPress={() => onChange('')} style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
          <Text color="$color" fontSize={12} fontWeight="500">重置</Text>
        </Pressable>
      </XStack>}
    </XStack>
  </YStack>;
}
