import { expect, test } from 'bun:test';
import { playStartupAnimation } from './startup-playback';
import { getStartupFrame } from './startup-motion';

function fakeClock() {
  let nextId = 0;
  const callbacks = new Map<number, (time: number) => void>();
  return {
    requestFrame(callback: (time: number) => void) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id: number) { callbacks.delete(id); },
    draw(time: number) {
      const frame = [...callbacks.values()];
      callbacks.clear();
      frame.forEach(callback => callback(time));
    },
    pending: () => callbacks.size,
  };
}

test('原生窗口显示延迟不会消耗三秒开屏，首个可绘制帧必须从零开始', () => {
  const clock = fakeClock();
  const elapsed: number[] = [];
  let finished = 0;
  playStartupAnimation(clock, time => elapsed.push(time), () => finished++);
  clock.draw(12000);
  expect(elapsed).toEqual([0]);
  expect(finished).toBe(0);
  clock.draw(13000);
  expect(elapsed.at(-1)).toBe(1000);
  clock.draw(14999);
  expect(finished).toBe(0);
  clock.draw(15001);
  expect(elapsed.at(-1)).toBe(3000);
  expect(finished).toBe(1);
  expect(clock.pending()).toBe(0);
  clock.draw(20000);
  expect(finished).toBe(1);
});

test('开屏取消后不再更新帧或提前进入首页', () => {
  const clock = fakeClock();
  const elapsed: number[] = [];
  let finished = 0;
  const cancel = playStartupAnimation(clock, time => elapsed.push(time), () => finished++);
  clock.draw(5000);
  clock.draw(5500);
  cancel();
  cancel();
  clock.draw(10000);
  expect(elapsed).toEqual([0, 500]);
  expect(finished).toBe(0);
  expect(clock.pending()).toBe(0);
});

test('首帧之前取消不会误触动画完成回调', () => {
  const clock = fakeClock();
  let calls = 0;
  const cancel = playStartupAnimation(clock, () => calls++, () => calls++);
  cancel();
  clock.draw(10000);
  expect(calls).toBe(0);
});

test('实际播放过程必须经过变形和品牌画面，完整三秒后才结束', () => {
  const clock = fakeClock();
  let frame = getStartupFrame(0);
  let finished = false;
  playStartupAnimation(clock, ms => { frame = getStartupFrame(ms); }, () => { finished = true; });
  clock.draw(50000);
  const initialWidth = frame.width;
  const initialHeight = frame.height;
  clock.draw(50750);
  expect(frame.width).toBeGreaterThan(initialWidth);
  expect(frame.height).toBeLessThan(initialHeight);
  expect(frame.waitingOpacity).toBeGreaterThan(0.95);
  expect(finished).toBe(false);
  clock.draw(51250);
  expect(frame.brandOpacity).toBe(1);
  clock.draw(51750);
  expect(frame.taglineOpacity).toBe(1);
  clock.draw(52999);
  expect(finished).toBe(false);
  clock.draw(53000);
  expect(finished).toBe(true);
});
