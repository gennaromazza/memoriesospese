import type { CSSProperties } from 'react';
import type { GiftCardThemeKey } from '@shared/gift-card-types';

export interface GiftCardThemeStyle {
  name: string;
  /** Colori del tema stagionale della piattaforma da cui deriva. */
  base: string;
  ink: string;
  sub: string;
  bg: string;
  /** Tre toni della cornice dorata (chiaro, scuro, riflesso). */
  foil: readonly [string, string, string];
  seal: string;
  sealInk: string;
  swatches: readonly [string, string, string];
}

export const GIFT_CARD_THEMES: Record<GiftCardThemeKey, GiftCardThemeStyle> = {
  natale: {
    name: 'Natale',
    base: 'rosso, verde e oro',
    ink: '#F4E7BF',
    sub: '#C8B07A',
    bg: 'linear-gradient(165deg,#134733 0%,#0B2D22 52%,#05160F 100%)',
    foil: ['#F6E3A0', '#B88A2B', '#FBEFC2'],
    seal: '#A8182C',
    sealInk: '#FFE3E0',
    swatches: ['#134733', '#F6E3A0', '#A8182C'],
  },
  carnevale: {
    name: 'Carnevale',
    base: 'arancio, viola e giallo oro',
    ink: '#FFE9C7',
    sub: '#E2B8FF',
    bg: 'linear-gradient(160deg,#4B1B78 0%,#30114F 55%,#1C0A33 100%)',
    foil: ['#FFD36B', '#F08A24', '#FFE9A8'],
    seal: '#F08A24',
    sealInk: '#2B0F47',
    swatches: ['#30114F', '#F08A24', '#FF4F8B'],
  },
  'san-valentino': {
    name: 'San Valentino',
    base: 'rosa intenso e rosa chiaro',
    ink: '#FFE4E1',
    sub: '#F4B2BE',
    bg: 'linear-gradient(160deg,#7B1636 0%,#53102A 55%,#2F0818 100%)',
    foil: ['#F9D2C6', '#C98A7C', '#FFE9E2'],
    seal: '#E23B5E',
    sealInk: '#FFF0F0',
    swatches: ['#53102A', '#F9D2C6', '#E23B5E'],
  },
  pasqua: {
    name: 'Pasqua',
    base: 'viola, giallo e verde pastello',
    ink: '#33264F',
    sub: '#6C5A93',
    bg: 'linear-gradient(160deg,#F1ECFF 0%,#E3F0F4 55%,#E5F5E2 100%)',
    foil: ['#B79CE8', '#8E6FCB', '#D9C9F6'],
    seal: '#8E6FCB',
    sealInk: '#FFFFFF',
    swatches: ['#E3F0F4', '#8E6FCB', '#F4D66B'],
  },
  halloween: {
    name: 'Halloween',
    base: 'arancio zucca e viola scuro',
    ink: '#FFD9A8',
    sub: '#B58CE0',
    bg: 'linear-gradient(170deg,#241446 0%,#140B2A 55%,#0A0614 100%)',
    foil: ['#FF9A2E', '#C2561B', '#FFC27A'],
    seal: '#E8731A',
    sealInk: '#1A0C2E',
    swatches: ['#140B2A', '#FF9A2E', '#7B3FC4'],
  },
  classico: {
    name: 'Classico',
    base: 'verde salvia e blu grigio del sito',
    ink: '#EAF0EC',
    sub: '#9DB3A8',
    bg: 'linear-gradient(165deg,#2C4254 0%,#1B2C3A 55%,#101C26 100%)',
    foil: ['#DCC48A', '#A88A4E', '#F0E2B8'],
    seal: '#7FA392',
    sealInk: '#0F1C16',
    swatches: ['#1B2C3A', '#DCC48A', '#7FA392'],
  },
};

export function resolveGiftCardTheme(theme: string | null | undefined): GiftCardThemeKey {
  return theme && theme in GIFT_CARD_THEMES ? (theme as GiftCardThemeKey) : 'classico';
}

/** Variabili CSS che colorano una card; vanno messe sull'elemento `.gcx`. */
export function giftCardThemeVars(theme: GiftCardThemeKey): CSSProperties {
  const t = GIFT_CARD_THEMES[theme];
  return {
    '--gk-ink': t.ink,
    '--gk-sub': t.sub,
    '--gk-bg': t.bg,
    '--gk-f1': t.foil[0],
    '--gk-f2': t.foil[1],
    '--gk-f3': t.foil[2],
    '--gk-seal': t.seal,
    '--gk-sealink': t.sealInk,
  } as CSSProperties;
}

/** Particelle della scena di apertura, diverse per ogni tema. */
export interface AmbientConfig {
  count: number;
  shape: 'dot' | 'rect' | 'heart';
  colors: readonly string[];
  /** Velocità verticale: positiva cade, negativa sale. */
  speed: readonly [number, number];
  size: readonly [number, number];
  sway: number;
}

export const GIFT_CARD_AMBIENT: Record<GiftCardThemeKey, AmbientConfig> = {
  natale: { count: 72, shape: 'dot', colors: ['rgba(255,255,255,.8)', 'rgba(246,227,160,.75)'], speed: [0.2, 0.7], size: [0.4, 2.2], sway: 0.25 },
  carnevale: { count: 46, shape: 'rect', colors: ['#FF8A3D', '#F7B731', '#FF4F8B', '#3DD6C6', '#B07CFF'], speed: [0.5, 1.4], size: [3, 7], sway: 0.6 },
  'san-valentino': { count: 26, shape: 'heart', colors: ['rgba(255,179,193,.7)', 'rgba(249,210,198,.6)'], speed: [-0.7, -0.25], size: [6, 16], sway: 0.35 },
  pasqua: { count: 34, shape: 'dot', colors: ['rgba(183,156,232,.55)', 'rgba(246,214,107,.6)', 'rgba(140,210,170,.55)'], speed: [0.15, 0.5], size: [3, 8], sway: 0.4 },
  halloween: { count: 40, shape: 'dot', colors: ['rgba(255,154,46,.8)', 'rgba(255,194,122,.7)'], speed: [-0.55, -0.15], size: [0.8, 2.6], sway: 0.35 },
  classico: { count: 40, shape: 'dot', colors: ['rgba(220,196,138,.7)', 'rgba(255,255,255,.55)'], speed: [0.1, 0.35], size: [0.5, 2], sway: 0.2 },
};
