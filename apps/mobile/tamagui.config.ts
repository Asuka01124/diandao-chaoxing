import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

// @ts-ignore TS2742: Tamagui's generated internal type contains its package store path.
const config = createTamagui({
  ...defaultConfig,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
  tokens: {
    ...defaultConfig.tokens,
    color: { brand: '#4D4D4D', danger: '#B94242', success: '#3E715A', canvasLight: '#F7F7F7', canvasDark: '#111111' },
    radius: { ...defaultConfig.tokens.radius, panel: 24, control: 16 },
  },
  themes: {
    ...defaultConfig.themes,
    light: { ...defaultConfig.themes.light, background: '#F7F7F7', color: '#141414', panel: '#FFFFFF', brand: '#4D4D4D', muted: '#707070', separator: '#E8E8E8', glassBorder: '#EEEEEE', glassTint: '#FFFFFF', overlay: '#11111170', onAccent: '#FFFFFF', danger: '#B94242', dangerSoft: '#F9EFEF', success: '#3E715A', ongoingHeader: '#EDF5EF', soft: '#F4F4F4', field: '#F6F6F6', fieldBorder: '#D6D6D6', actionSurface: '#141414', actionText: '#FFFFFF', actionBorder: '#141414', secondarySurface: '#FFFFFF', secondaryText: '#141414', secondaryBorder: '#E8E8E8' },
    dark: { ...defaultConfig.themes.dark, background: '#111111', color: '#F5F5F5', panel: '#1D1D1D', brand: '#E1E1E1', muted: '#9E9E9E', separator: '#2E2E2E', glassBorder: '#353535', glassTint: '#1D1D1D', overlay: '#000000B8', onAccent: '#141414', danger: '#FF9898', dangerSoft: '#332020', success: '#82CAA2', ongoingHeader: '#1F3328', soft: '#292929', field: '#252525', fieldBorder: '#444444', actionSurface: '#F5F5F5', actionText: '#141414', actionBorder: '#F5F5F5', secondarySurface: '#262626', secondaryText: '#F5F5F5', secondaryBorder: '#353535' },
  },
});
export default config;
export type AppTamaguiConfig = typeof config;
declare module 'tamagui' { interface TamaguiCustomConfig extends AppTamaguiConfig {} }
