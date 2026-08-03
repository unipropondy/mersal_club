import { Platform } from 'react-native';

/**
 * ★ Royal Noir — Smart Club Customer Display Theme ★
 *
 * Dual-Combo Palette (synced with frontend/constants/theme.ts):
 *   DARK  → Deep Indigo-Black + Electric Violet (#A855F7) glow
 *   LIGHT → Lavender-White surfaces (#EDE9FE / #F5F3FF) for highlights
 */

export const Palette = {
  darkest:   '#08071A',
  dark900:   '#0C0A22',
  dark800:   '#11102E',
  dark700:   '#18163A',
  dark600:   '#221F4A',
  dark500:   '#2E2A5E',
  dark400:   '#3D3875',

  violet900: '#2E1065',
  violet800: '#4B1C71',
  violet700: '#5416B5',
  violet600: '#6D28D9',
  violet500: '#7C3AED',
  violet400: '#8B5CF6',
  violet300: '#A855F7',
  violet200: '#C084FC',
  violet100: '#DDD6FE',
  violet50:  '#EDE9FE',

  lavender:  '#F5F3FF',
  lilac:     '#EDE9FE',
  orchid:    '#DDD6FE',
  mauve:     '#C084FC',

  neonPink:  '#EC4899',
  neonGold:  '#F59E0B',
  neonGreen: '#10B981',
  neonBlue:  '#3B82F6',
  neonRed:   '#EF4444',
  neonCyan:  '#06B6D4',
};

export const Theme = {
  // ── Primary Brand ──
  primary:       '#A855F7',
  primaryDark:   '#7C3AED',
  primaryDeep:   '#4B1C71',
  primaryLight:  '#221F4A',
  primaryBorder: 'rgba(168,85,247,0.40)',
  primaryGlow:   'rgba(168,85,247,0.20)',

  // ── DARK combo ──
  bgMain:    '#0C0A22',
  bgCard:    '#11102E',
  bgInput:   '#18163A',
  bgNav:     '#08071A',
  bgMuted:   '#221F4A',
  bgOverlay: 'rgba(8,7,26,0.96)',

  // ── LIGHT combo (for highlights / modal accents) ──
  lightBg:      '#F5F3FF',
  lightCard:    '#EDE9FE',
  lightBorder:  '#DDD6FE',
  lightText:    '#4B1C71',
  lightSubText: '#7C3AED',
  lightMuted:   '#C084FC',

  // ── Legacy compat ──
  bgDark:      '#0C0A22',
  cardDark:    '#11102E',
  borderDark:  '#3D3875',
  bgDarkMuted: '#221F4A',

  // ── Text ──
  textPrimary:   '#F0EEFF',
  textSecondary: '#9B8EC4',
  textMuted:     '#5A5080',
  textInverse:   '#0C0A22',
  textOrange:    '#A855F7',

  // ── Borders ──
  border:        '#3D3875',
  borderStrong:  '#4A4588',
  borderOrange:  'rgba(168,85,247,0.35)',

  // ── Glassmorphism ──
  glassCard:         'rgba(168,85,247,0.06)',
  glassBorder:       'rgba(168,85,247,0.15)',
  glassCardStrong:   'rgba(168,85,247,0.12)',
  glassBorderStrong: 'rgba(168,85,247,0.35)',

  // ── Gradients ──
  gradientPrimary:  ['#7C3AED', '#A855F7'],
  gradientDark:     ['#08071A', '#0C0A22', '#11102E'],
  gradientViridian: ['#4B1C71', '#7C3AED', '#A855F7'],
  gradientLight:    ['#EDE9FE', '#F5F3FF'],

  // ── Shadows ──
  shadowSm: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: Platform.OS === 'android' ? 2 : 2,
  },
  shadowMd: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: Platform.OS === 'android' ? 4 : 4,
  },
  shadowLg: {
    shadowColor: '#4B1C71',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: Platform.OS === 'android' ? 8 : 8,
  },

  // ── Semantic Status ──
  success:       '#10B981',
  successBg:     'rgba(16,185,129,0.12)',
  successBorder: 'rgba(16,185,129,0.35)',

  warning:       '#F59E0B',
  warningBg:     'rgba(245,158,11,0.12)',
  warningBorder: 'rgba(245,158,11,0.35)',

  danger:        '#EF4444',
  dangerBg:      'rgba(239,68,68,0.12)',
  dangerBorder:  'rgba(239,68,68,0.35)',

  info:          '#3B82F6',
  infoBg:        'rgba(59,130,246,0.12)',
  infoBorder:    'rgba(59,130,246,0.35)',

  // ── Table status ──
  tableLocked:      { bg: 'rgba(239,68,68,0.15)',    border: '#EF4444' },
  tableHold:        { bg: 'rgba(59,130,246,0.15)',   border: '#3B82F6' },
  tableSent:        { bg: 'rgba(16,185,129,0.15)',   border: '#10B981' },
  tableSentOld:     { bg: 'rgba(168,85,247,0.18)',   border: '#A855F7' },
  tableBillRequest: { bg: 'rgba(245,158,11,0.15)',   border: '#F59E0B' },
  tableEmpty:       { bg: 'rgba(168,85,247,0.04)',   border: '#3D3875' },

  // ── Radius ──
  radiusSm:   8,
  radiusMd:   12,
  radiusLg:   16,
  radiusXl:   24,
  radiusFull: 999,
};

export const Colors = {
  light: {
    text:            Theme.textPrimary,
    background:      Theme.bgMain,
    tint:            Theme.primary,
    icon:            Theme.textSecondary,
    tabIconDefault:  Theme.textSecondary,
    tabIconSelected: Theme.primary,
  },
  dark: {
    text:            Theme.textPrimary,
    background:      Theme.bgMain,
    tint:            Theme.primary,
    icon:            Theme.textSecondary,
    tabIconDefault:  Theme.textSecondary,
    tabIconSelected: Theme.primary,
  },
};
