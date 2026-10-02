import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, XStack, YStack, useTheme } from 'tamagui';

const CELL = 84;
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

  return <YStack gap={14}>
    <Text color="$muted" fontSize={14} lineHeight={22}>照着老师给出的手势，按顺序点选圆点，至少选择 4 个。</Text>
    <View style={{ width: SIZE, height: SIZE, alignSelf: 'center', borderWidth: 1, borderColor: theme.fieldBorder.val, backgroundColor: theme.panel.val, borderRadius: 24 }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d={line} fill="none" stroke={theme.brand.val} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      {Array.from({ length: 9 }, (_, index) => {
        const digit = String(index + 1);
        const order = value.indexOf(digit) + 1;
        const selected = order > 0;
        return <Pressable key={digit} accessibilityRole="button" accessibilityLabel={`圆点 ${digit}${selected ? `，第 ${order} 步` : ''}`}
          accessibilityState={{ selected }} onPress={() => { if (!selected) onChange(value + digit); }}
          style={({ pressed }) => ({ position: 'absolute', left: (index % 3) * CELL, top: Math.floor(index / 3) * CELL,
            width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.68 : 1 })}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: selected ? 0 : 1.5, borderColor: theme.fieldBorder.val,
            backgroundColor: selected ? theme.brand.val : theme.field.val, alignItems: 'center', justifyContent: 'center' }}>
            <Text color={selected ? '$onAccent' : '$color'} fontSize={19} fontWeight="600">{digit}</Text>
          </View>
          {selected && <View style={{ position: 'absolute', right: 5, top: 5, minWidth: 22, height: 22, borderRadius: 11,
            backgroundColor: theme.panel.val, borderWidth: 1, borderColor: theme.fieldBorder.val, alignItems: 'center', justifyContent: 'center' }}>
            <Text color="$color" fontSize={11} fontWeight="700">{order}</Text>
          </View>}
        </Pressable>;
      })}
    </View>
    <Text color={value.length >= 4 ? '$color' : '$muted'} fontSize={13} textAlign="center">
      {value.length ? `已选 ${value.length} 个圆点${value.length < 4 ? '，还需至少 4 个' : '，可以开始签到'}` : '尚未选择手势'}
    </Text>
    <XStack gap={10}>
      <Pressable accessibilityRole="button" accessibilityLabel="撤销上一步" accessibilityState={{ disabled: !value }} disabled={!value}
        onPress={() => onChange(value.slice(0, -1))} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: theme.soft.val,
          alignItems: 'center', justifyContent: 'center', opacity: !value ? 0.5 : pressed ? 0.65 : 1 })}>
        <Text color="$color" fontSize={14}>撤销上一步</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="重新选择手势" accessibilityState={{ disabled: !value }} disabled={!value}
        onPress={() => onChange('')} style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 13, backgroundColor: theme.soft.val,
          alignItems: 'center', justifyContent: 'center', opacity: !value ? 0.5 : pressed ? 0.65 : 1 })}>
        <Text color="$color" fontSize={14}>重新选择</Text>
      </Pressable>
    </XStack>
  </YStack>;
}
