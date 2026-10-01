import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

// @ts-ignore TS2742: Tamagui's generated internal type contains its package store path.
const config = createTamagui({
  ...defaultConfig,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
  tokens: {
    ...defaultConfig.tokens,
    color: { brand: '#3155D9', danger: '#C93650', success: '#138A70', canvasLight: '#EDF2FB', canvasDark: '#090F20' },
    radius: { ...defaultConfig.tokens.radius, panel: 24, control: 16 },
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, background: '#EDF2FB', color: '#17233F', panel: '#FFFFFFC9', brand: '#3155D9', muted: '#56647F', separator: '#D9E2F1B8', glassBorder: '#FFFFFFE8', glassTint: '#FFFFFFA8', overlay: '#0B163B80', onAccent: '#FFFFFF', danger: '#BF2B45', success: '#08745E', soft: '#DCE7FFAD', field: '#FFFFFFB8' },
    dark: { ...defaultConfig.themes.dark, background: '#090F20', color: '#F5F7FF', panel: '#192442C9', brand: '#A5B8FF', muted: '#A5B1CF', separator: '#FFFFFF21', glassBorder: '#FFFFFF30', glassTint: '#17233DA8', overlay: '#020712B8', onAccent: '#101B3C', danger: '#FF8EA4', success: '#60D9B5', soft: '#41568475', field: '#24314EBA' },
  },
});
export default config;
export type AppTamaguiConfig = typeof config;
declare module 'tamagui' { interface TamaguiCustomConfig extends AppTamaguiConfig {} }
