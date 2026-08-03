import { Platform } from 'react-native';

/**
 * ★ Royal Noir — Smart Club Venue POS Theme ★
 *
 * Dual-Combo Palette:
 *   DARK  → Deep Indigo-Black + Electric Violet (#A855F7) glow
 *   LIGHT → Lavender-White surfaces (#EDE9FE / #F5F3FF) for modals & highlights
 *
 * Inspired by: #4b1c71 → #7f4ca5 → #b57edc → #dbb6ee → #fff0ff
 *              & #0F083B → #7F3AA1 → #5416B5 (gradient orb)
 */

// ── Raw palette constants (for gradient arrays) ──────────────────────────────
export const Palette = {
  // Dark backgrounds — deep indigo/navy
  darkest:   '#08071A',   // absolute darkest — navbar, outer bg
  dark900:   '#0C0A22',   // main page background
  dark800:   '#11102E',   // card base
  dark700:   '#18163A',   // elevated card
  dark600:   '#221F4A',   // muted surface / input
  dark500:   '#2E2A5E',   // active states on dark
  dark400:   '#3D3875',   // border strong

  // Violet spectrum
  violet900: '#2E1065',   // deepest violet (shadow tint)
  violet800: '#4B1C71',   // rich jewel purple
  violet700: '#5416B5',   // electric indigo
  violet600: '#6D28D9',   // vivid violet
  violet500: '#7C3AED',   // primary dark
  violet400: '#8B5CF6',   // primary default
  violet300: '#A855F7',   // primary light / glow
  violet200: '#C084FC',   // soft violet
  violet100: '#DDD6FE',   // light surface accent
  violet50:  '#EDE9FE',   // lightest lavender surface

  // Light combo surfaces (for modals, highlights, light-combo accents)
  lavender:  '#F5F3FF',   // near-white lavender
  lilac:     '#EDE9FE',   // modal card bg (light mode accent)
  orchid:    '#DDD6FE',   // border on light surfaces
  mauve:     '#C084FC',   // secondary text on light surfaces

  // Neon accents
  neonPink:  '#EC4899',
  neonGold:  '#F59E0B',
  neonGreen: '#10B981',
  neonBlue:  '#3B82F6',
  neonRed:   '#EF4444',
  neonCyan:  '#06B6D4',
};

export const Theme = {
  // ── Primary Brand — Electric Violet / Purple ──────────────────────────────
  primary:       Palette.violet300,   // #A855F7  glowing violet
  primaryDark:   Palette.violet500,   // #7C3AED  deep button fill
  primaryDeep:   Palette.violet800,   // #4B1C71  jewel shadow
  primaryLight:  Palette.dark600,     // #221F4A  pressed/light tint on dark bg
  primaryBorder: 'rgba(168,85,247,0.40)',
  primaryGlow:   'rgba(168,85,247,0.20)',  // ambient glow behind buttons

  // ── DARK combo — main app surfaces ───────────────────────────────────────
  bgMain:    Palette.dark900,   // #0C0A22  page background
  bgCard:    Palette.dark800,   // #11102E  card surface
  bgInput:   Palette.dark700,   // #18163A  input / search bar
  bgNav:     Palette.darkest,   // #08071A  header / nav bar
  bgMuted:   Palette.dark600,   // #221F4A  secondary surfaces
  bgOverlay: 'rgba(8,7,26,0.96)',

  // ── LIGHT combo — accent surfaces (modals, highlights, tooltips) ─────────
  lightBg:       Palette.lavender,  // #F5F3FF  near-white lavender surface
  lightCard:     Palette.lilac,     // #EDE9FE  modal card background
  lightBorder:   Palette.orchid,    // #DDD6FE  border on light surfaces
  lightText:     Palette.violet800, // #4B1C71  dark purple text on light bg
  lightSubText:  Palette.violet500, // #7C3AED  secondary text on light bg
  lightMuted:    Palette.mauve,     // #C084FC  muted text on light bg

  // ── Legacy dark palette tokens (kept for compat) ─────────────────────────
  bgDark:      Palette.dark900,
  cardDark:    Palette.dark800,
  borderDark:  Palette.dark400,
  bgDarkMuted: Palette.dark600,

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   '#F0EEFF',          // near-white lavender
  textSecondary: '#9B8EC4',          // muted medium violet
  textMuted:     '#5A5080',          // placeholder / disabled
  textInverse:   Palette.dark900,    // dark text on light surfaces
  textOrange:    Palette.violet300,  // legacy orange → remapped to violet

  // ── Borders ──────────────────────────────────────────────────────────────
  border:        Palette.dark400,                  // #3D3875 subtle dark border
  borderStrong:  '#4A4588',                        // stronger dark border
  borderOrange:  'rgba(168,85,247,0.35)',           // violet border (legacy key)

  // ── Neon Accent Colors ───────────────────────────────────────────────────
  neonViolet: Palette.violet300,
  neonBlue:   Palette.neonBlue,
  neonPink:   Palette.neonPink,
  neonGold:   Palette.neonGold,
  neonGreen:  Palette.neonGreen,
  neonRed:    Palette.neonRed,
  neonCyan:   Palette.neonCyan,

  // ── Glassmorphism (violet tinted) ────────────────────────────────────────
  glassCard:         'rgba(168,85,247,0.06)',
  glassBorder:       'rgba(168,85,247,0.15)',
  glassCardStrong:   'rgba(168,85,247,0.12)',
  glassBorderStrong: 'rgba(168,85,247,0.35)',
  glassDark:         'rgba(8,7,26,0.75)',     // frosted dark panel

  // ── Gradient Presets (use with LinearGradient) ───────────────────────────
  gradientPrimary:    ['#7C3AED', '#A855F7'],        // button / CTA
  gradientDark:       ['#08071A', '#0C0A22', '#11102E'], // background
  gradientCard:       ['#18163A', '#11102E'],        // card surface
  gradientViridian:   ['#4B1C71', '#7C3AED', '#A855F7'], // hero sections
  gradientOrb:        ['#0F083B', '#7F3AA1', '#5416B5'], // from ref image
  gradientLight:      ['#EDE9FE', '#F5F3FF'],        // light-combo modal bg

  // ── Glow / Bloom effects ─────────────────────────────────────────────────
  glowPrimary: 'rgba(168,85,247,0.35)',
  glowStrong:  'rgba(124,58,237,0.50)',
  glowSubtle:  'rgba(168,85,247,0.12)',

  // ── Shadows (violet glow for dark mode) ──────────────────────────────────
  shadowSm: {
    shadowColor: Palette.violet300,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: Platform.OS === 'android' ? 2 : 2,
  },
  shadowMd: {
    shadowColor: Palette.violet500,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: Platform.OS === 'android' ? 4 : 4,
  },
  shadowLg: {
    shadowColor: Palette.violet800,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: Platform.OS === 'android' ? 8 : 8,
  },
  shadowGlow: {
    shadowColor: Palette.violet300,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: Platform.OS === 'android' ? 6 : 6,
  },

  // ── Semantic Status Colors (neon dark-mode) ───────────────────────────────
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

  // ── Table / Zone status ───────────────────────────────────────────────────
  tableLocked:      { bg: 'rgba(239,68,68,0.15)',    border: '#EF4444' },
  tableHold:        { bg: 'rgba(59,130,246,0.15)',   border: '#3B82F6' },
  tableSent:        { bg: 'rgba(16,185,129,0.15)',   border: '#10B981' },
  tableSentOld:     { bg: 'rgba(168,85,247,0.18)',   border: '#A855F7' },
  tableBillRequest: { bg: 'rgba(245,158,11,0.15)',   border: '#F59E0B' },
  tableEmpty:       { bg: 'rgba(168,85,247,0.04)',   border: '#3D3875' },

  // ── Radius ───────────────────────────────────────────────────────────────
  radiusSm:   8,
  radiusMd:   12,
  radiusLg:   16,
  radiusXl:   24,
  radiusFull: 999,
};

// ── Legacy Colors export ─────────────────────────────────────────────────────
export const Colors = {
  light: {
    text:             Theme.textPrimary,
    background:       Theme.bgMain,
    tint:             Theme.primary,
    icon:             Theme.textSecondary,
    tabIconDefault:   Theme.textSecondary,
    tabIconSelected:  Theme.primary,
  },
  dark: {
    text:             Theme.textPrimary,
    background:       Theme.bgMain,
    tint:             Theme.primary,
    icon:             Theme.textSecondary,
    tabIconDefault:   Theme.textSecondary,
    tabIconSelected:  Theme.primary,
  },
};
