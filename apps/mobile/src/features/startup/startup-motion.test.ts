import { expect, test } from 'bun:test';
import { getStartupFrame, getStartupScale, STARTUP_ANIMATION_MS } from './startup-motion';

test('开屏保持三秒，只播放一次，结束后保留原手势图标', () => {
  expect(STARTUP_ANIMATION_MS).toBe(3000);
  const start = getStartupFrame(0);
  const end = getStartupFrame(3000);
  for (const key of ['width', 'height', 'radius', 'camera', 'handSize', 'handX', 'handY', 'handAngle'] as const) {
    expect(end[key]).toBe(start[key]);
  }
  expect(end.waitingOpacity).toBe(0);
  expect(end.brandOpacity).toBe(0);
  expect(end.symbolOpacity).toBe(0);
  expect(getStartupFrame(12000)).toEqual(end);
  expect(getStartupFrame(-100)).toEqual(start);
});

test('手势、确认条、对勾和标题按预览顺序切换，文字不重叠', () => {
  expect(getStartupFrame(250).targetOpacity).toBe(1);
  expect(getStartupFrame(750).waitingOpacity).toBeGreaterThan(0.95);
  expect(getStartupFrame(750).brandOpacity).toBe(0);
  expect(getStartupFrame(1250).brandOpacity).toBe(1);
  expect(getStartupFrame(1750).taglineOpacity).toBe(1);
  for (let ms = 0; ms <= 3000; ms += 10) {
    const frame = getStartupFrame(ms);
    expect(frame.waitingOpacity > 0 && frame.brandOpacity > 0).toBe(false);
  }
});

test('跳帧和乱序读取不会改变开屏画面，小屏幕和横屏也不会越界', () => {
  const expected = getStartupFrame(1437);
  getStartupFrame(2900);
  getStartupFrame(100);
  expect(getStartupFrame(1437)).toEqual(expected);
  for (const [width, height] of [[180, 320], [320, 568], [375, 812], [812, 375], [1024, 1366]]) {
    const scale = getStartupScale(width, height);
    for (let ms = 0; ms <= 3000; ms += 1000 / 60) {
      const frame = getStartupFrame(ms);
      expect(frame.width * frame.camera * scale).toBeLessThan(width - 31);
      expect(frame.height * frame.camera * scale).toBeLessThan(height - 31);
      for (const value of Object.values(frame)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
  }
});
