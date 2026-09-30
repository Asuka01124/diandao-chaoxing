import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

// @ts-ignore TS2742: Tamagui's generated internal type contains its package store path.
const config = createTamagui({
  ...defaultConfig,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
  tokens: {
    ...defaultConfig.tokens,
    color: { brand: '#007AFF', danger: '#FF3B30', success: '#34C759', canvasLight: '#F2F2F7', canvasDark: '#000000' },
    radius: { ...defaultConfig.tokens.radius, panel: 18, control: 14 },
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, background: '#F2F2F7', color: '#1C1C1E', panel: '#FFFFFF', brand: '#007AFF', muted: '#6E6E73', separator: '#E5E5EA', overlay: '#00000077', onAccent: '#FFFFFF', danger: '#FF3B30', success: '#248A3D', soft: '#E8F2FF', field: '#F2F2F7' },
    dark: { ...defaultConfig.themes.dark, background: '#000000', color: '#F5F5F7', panel: '#1C1C1E', brand: '#0A84FF', muted: '#98989D', separator: '#38383A', overlay: '#000000AA', onAccent: '#FFFFFF', danger: '#FF453A', success: '#30D158', soft: '#12304D', field: '#2C2C2E' },
  },
});
export default config;
export type AppTamaguiConfig = typeof config;
declare module 'tamagui' { interface TamaguiCustomConfig extends AppTamaguiConfig {} }
