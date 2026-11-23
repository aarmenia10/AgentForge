/**
 * Appearance: the pure color logic behind the theme panel (UI preview).
 *
 * Everything here is free of React and the DOM so it can be unit tested and
 * imported by `vite.config.ts` (which is why it uses relative imports only).
 * The browser applies the result as CSS variables on <html>; the pre-paint
 * script in index.html applies the same variables before first paint.
 */

export type Mode = 'dark' | 'light'
export type Rgb = readonly [number, number, number]

export interface Preset {
  id: string
  label: string
  rgb: Rgb
}

export const DARK_BACKGROUNDS: readonly Preset[] = [
  { id: 'black', label: 'Black', rgb: [10, 10, 10] },
  { id: 'charcoal', label: 'Charcoal', rgb: [24, 24, 27] },
  { id: 'midnight', label: 'Midnight navy', rgb: [12, 18, 34] },
]

export const LIGHT_BACKGROUNDS: readonly Preset[] = [
  { id: 'white', label: 'White', rgb: [255, 255, 255] },
  { id: 'cream', label: 'Cream', rgb: [250, 247, 240] },
  { id: 'soft-gray', label: 'Soft gray', rgb: [244, 244, 245] },
]

export const ACCENTS: readonly (Preset & { lightSeed?: Rgb })[] = [
  // `lightSeed` is the darker lemon used as text or an icon on light
  // backgrounds. It is only a starting point: the final text color is darkened
  // until it reaches AA contrast.
  {
    id: 'lemon',
    label: 'Lemon',
    rgb: [250, 214, 40],
    lightSeed: [202, 160, 0],
  },
  { id: 'purple', label: 'Purple', rgb: [97, 66, 255] },
  { id: 'teal', label: 'Teal', rgb: [20, 184, 166] },
  { id: 'orange', label: 'Orange', rgb: [249, 115, 22] },
  { id: 'pink', label: 'Pink', rgb: [236, 72, 153] },
  { id: 'green', label: 'Green', rgb: [34, 197, 94] },
]

export const DEFAULT_MODE: Mode = 'dark'
export const CUSTOM = 'custom'

export interface AppearanceState {
  mode: Mode
  /** Preset id or `custom`, per mode. */
  bg: Record<Mode, string>
  /** Hex color used when `bg[mode]` is `custom`, per mode. */
  customBg: Record<Mode, string>
  /** Preset id or `custom`. */
  accent: string
  customAccent: string
}

export const DEFAULT_STATE: AppearanceState = {
  mode: DEFAULT_MODE,
  bg: { dark: 'black', light: 'white' },
  customBg: { dark: '#0a0a0a', light: '#ffffff' },
  accent: 'lemon',
  customAccent: '#fad628',
}

// ---------------------------------------------------------------- color math

export function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

export function parseHex(value: unknown): Rgb | null {
  if (typeof value !== 'string') return null
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function toHex(rgb: Rgb): string {
  return (
    '#' + rgb.map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')
  )
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(rgb: Rgb): number {
  return (
    0.2126 * channel(rgb[0]) +
    0.7152 * channel(rgb[1]) +
    0.0722 * channel(rgb[2])
  )
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Linear mix in sRGB: `t` 0 returns `a`, 1 returns `b`. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    clamp255(a[0] + (b[0] - a[0]) * t),
    clamp255(a[1] + (b[1] - a[1]) * t),
    clamp255(a[2] + (b[2] - a[2]) * t),
  ]
}

const BLACK: Rgb = [0, 0, 0]
const WHITE: Rgb = [255, 255, 255]

/** Black or white, whichever reads better on `fill`. Always at least 4.58:1. */
export function textOnAccent(fill: Rgb): Rgb {
  return contrast(fill, BLACK) >= contrast(fill, WHITE) ? BLACK : WHITE
}

/**
 * Moves `color` toward `toward` in small steps until it reaches `min` contrast
 * against every color in `against`. Returns the color unchanged when it
 * already passes, and the end of the path (`toward`) when nothing passes.
 */
export function ensureContrast(
  color: Rgb,
  against: readonly Rgb[],
  min: number,
  toward: Rgb,
): Rgb {
  for (let step = 0; step <= 50; step++) {
    const candidate = mix(color, toward, step / 50)
    if (against.every((bg) => contrast(candidate, bg) >= min)) return candidate
  }
  return toward
}

/** True for a background that should get light text. */
export function isDarkColor(rgb: Rgb): boolean {
  return luminance(rgb) < 0.179
}

// ----------------------------------------------------------------- guards

const MIN_ACCENT_CONTRAST = 3

export interface GuardedAccent {
  rgb: Rgb
  /** Set when the chosen accent was too close to the background and moved. */
  warning: string | null
}

/**
 * Keeps an accent visible against the page: under 3:1 it is darkened (on a
 * light page) or lightened (on a dark page) until it reaches 3:1.
 */
export function guardAccent(accent: Rgb, bg: Rgb): GuardedAccent {
  if (contrast(accent, bg) >= MIN_ACCENT_CONTRAST)
    return { rgb: accent, warning: null }
  const lighten = isDarkColor(bg)
  const adjusted = ensureContrast(
    accent,
    [bg],
    MIN_ACCENT_CONTRAST,
    lighten ? WHITE : BLACK,
  )
  return {
    rgb: adjusted,
    warning: `That accent was too close to the background, so it was ${lighten ? 'lightened' : 'darkened'} to stay visible.`,
  }
}

export interface GuardedBackground {
  rgb: Rgb
  warning: string | null
}

/** Keeps a custom background on the right side of the mode it was picked for. */
export function guardBackground(bg: Rgb, mode: Mode): GuardedBackground {
  if (mode === 'dark') {
    if (luminance(bg) <= 0.1) return { rgb: bg, warning: null }
    return {
      rgb: ensureLuminance(bg, 0.1, BLACK),
      warning:
        'That background was too light for dark mode, so it was darkened. Switch to light mode to use it.',
    }
  }
  if (luminance(bg) >= 0.45) return { rgb: bg, warning: null }
  return {
    rgb: ensureLuminance(bg, 0.45, WHITE),
    warning:
      'That background was too dark for light mode, so it was lightened. Switch to dark mode to use it.',
  }
}

function ensureLuminance(color: Rgb, target: number, toward: Rgb): Rgb {
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(color, toward, step / 100)
    const lum = luminance(candidate)
    if (toward === BLACK ? lum <= target : lum >= target) return candidate
  }
  return toward
}

// ----------------------------------------------------------------- presets

export function findPreset<T extends Preset>(
  list: readonly T[],
  id: string,
): T | undefined {
  return list.find((preset) => preset.id === id)
}

function backgroundList(mode: Mode): readonly Preset[] {
  return mode === 'dark' ? DARK_BACKGROUNDS : LIGHT_BACKGROUNDS
}

export interface Resolved {
  bg: Rgb
  accent: Rgb
  /** Preset seed for accent text on light backgrounds, when the preset has one. */
  accentLightSeed: Rgb | null
  warnings: string[]
}

/** Turns stored choices into concrete colors, applying both guards. */
export function resolveColors(state: AppearanceState): Resolved {
  const { mode } = state
  const warnings: string[] = []

  let bg: Rgb
  const bgPreset = findPreset(backgroundList(mode), state.bg[mode])
  if (bgPreset) {
    bg = bgPreset.rgb
  } else {
    const custom = parseHex(state.customBg[mode]) ?? backgroundList(mode)[0].rgb
    const guarded = guardBackground(custom, mode)
    bg = guarded.rgb
    if (guarded.warning) warnings.push(guarded.warning)
  }

  let accent: Rgb
  let accentLightSeed: Rgb | null = null
  const accentPreset = findPreset(ACCENTS, state.accent)
  if (accentPreset) {
    accent = accentPreset.rgb
    accentLightSeed = accentPreset.lightSeed ?? null
  } else {
    const custom = parseHex(state.customAccent) ?? ACCENTS[0].rgb
    const guarded = guardAccent(custom, bg)
    accent = guarded.rgb
    if (guarded.warning) warnings.push(guarded.warning)
  }

  return { bg, accent, accentLightSeed, warnings }
}

// ------------------------------------------------------------------ tokens

export type Tokens = Record<string, string>

const RAMP_STOPS = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const
/**
 * Where each stop sits between the light end and the dark end. Light pages
 * push the mid stops darker because the legacy classes use 500 and 600 for
 * text there; dark pages use 300 and 400.
 */
const RAMP_POSITION: Record<
  Mode,
  Record<(typeof RAMP_STOPS)[number], number>
> = {
  light: {
    50: 0,
    100: 0.06,
    200: 0.18,
    300: 0.34,
    400: 0.5,
    500: 0.66,
    600: 0.76,
    700: 0.84,
    800: 0.9,
    900: 0.95,
    950: 1,
  },
  dark: {
    50: 0,
    100: 0.06,
    200: 0.18,
    300: 0.32,
    400: 0.45,
    500: 0.58,
    600: 0.7,
    700: 0.8,
    800: 0.88,
    900: 0.94,
    950: 1,
  },
}

export interface Derived {
  bg: Rgb
  surface: Rgb
  surface2: Rgb
  text: Rgb
  muted: Rgb
  border: Rgb
  accent: Rgb
  accentInk: Rgb
  /** The accent when it is used as text or an icon on the page. */
  accentText: Rgb
  /** Neutral ramp, light end to dark end, used for the legacy slate and navy classes. */
  ramp: Record<number, Rgb>
  /** Accent ramp for the legacy teal classes. */
  accentRamp: Record<number, Rgb>
  dark: boolean
}

/**
 * Derives every color from a background and an accent. `mode` decides which
 * way the neutral ramp runs; the surface step follows the background itself.
 */
export function derive(
  bg: Rgb,
  accent: Rgb,
  mode: Mode,
  accentLightSeed: Rgb | null = null,
): Derived {
  const dark = mode === 'dark'
  const text: Rgb = dark ? mix(bg, WHITE, 0.96) : mix(bg, BLACK, 0.94)
  // A step lighter than a dark page, a step darker than a light one.
  const surface = dark ? mix(bg, WHITE, 0.06) : mix(bg, BLACK, 0.04)
  const surface2 = dark ? mix(bg, WHITE, 0.11) : mix(bg, BLACK, 0.08)
  const border = mix(bg, text, 0.12)
  const muted = ensureContrast(
    mix(text, bg, 0.34),
    [bg, surface, surface2],
    4.6,
    text,
  )

  const accentInk = textOnAccent(accent)

  // Accent as text. Dark pages lighten it; light pages darken it, starting
  // from the preset's darker seed when it has one. 4.8 leaves room for the
  // 15% accent tint that chips and badges put behind this text.
  const textStart = dark ? accent : (accentLightSeed ?? accent)
  const accentText = ensureContrast(
    textStart,
    [bg, surface, surface2],
    4.8,
    dark ? WHITE : BLACK,
  )

  const lightEnd = dark ? text : bg
  const darkEnd = dark ? bg : text
  const ramp = {} as Record<number, Rgb>
  for (const stop of RAMP_STOPS)
    ramp[stop] = mix(lightEnd, darkEnd, RAMP_POSITION[mode][stop])
  // Stops that the legacy classes use for text (dark pages: 400 and lighter;
  // light pages: 500 and darker) must stay readable on busy custom backgrounds.
  for (const stop of RAMP_STOPS) {
    const usedAsText = dark ? stop <= 400 : stop >= 500 && stop <= 900
    if (usedAsText)
      ramp[stop] = ensureContrast(ramp[stop], [bg, surface], 4.5, text)
  }

  // Legacy filled buttons: `bg-teal-700 text-white` on light pages and
  // `bg-teal-400 text-navy-950` on dark ones. 700 stays dark enough for white
  // text; 400 stays light enough for the page-colored text.
  const fillLight = ensureContrast(accent, [WHITE], 4.6, BLACK)
  const fillDark = ensureContrast(accent, [bg], 4.6, WHITE)
  const accentRamp: Record<number, Rgb> = {
    50: mix(bg, accent, 0.08),
    100: mix(bg, accent, 0.16),
    200: mix(bg, accent, 0.32),
    300: dark ? accentText : mix(accent, WHITE, 0.35),
    400: dark ? fillDark : mix(accent, WHITE, 0.15),
    500: accent,
    600: dark ? mix(accent, BLACK, 0.12) : accentText,
    700: dark ? mix(accent, BLACK, 0.3) : fillLight,
    800: mix(fillLight, BLACK, 0.2),
    900: mix(fillLight, BLACK, 0.4),
    950: mix(fillLight, BLACK, 0.6),
  }
  if (!dark) accentRamp[700] = ensureContrast(accentText, [WHITE], 4.6, BLACK)

  return {
    bg,
    surface,
    surface2,
    text,
    muted,
    border,
    accent,
    accentInk,
    accentText,
    ramp,
    accentRamp,
    dark,
  }
}

const rgbTriplet = (c: Rgb) => c.join(' ')

/** Flat map of CSS variable name to value, ready for `style.setProperty`. */
export function tokensFor(state: AppearanceState): {
  tokens: Tokens
  warnings: string[]
  dark: boolean
} {
  const resolved = resolveColors(state)
  const d = derive(
    resolved.bg,
    resolved.accent,
    state.mode,
    resolved.accentLightSeed,
  )
  const tokens: Tokens = {
    '--lm-bg': toHex(d.bg),
    '--lm-surface': toHex(d.surface),
    '--lm-surface-2': toHex(d.surface2),
    '--lm-text': toHex(d.text),
    '--lm-muted': toHex(d.muted),
    '--lm-border': toHex(d.border),
    '--lm-accent': toHex(d.accent),
    '--lm-accent-ink': toHex(d.accentInk),
    '--lm-accent-text': toHex(d.accentText),
    '--lm-accent-rgb': rgbTriplet(d.accent),
    '--lm-shadow': d.dark
      ? '0 18px 40px -18px rgb(0 0 0 / 0.8)'
      : '0 18px 40px -20px rgb(15 23 42 / 0.28)',
  }
  for (const stop of RAMP_STOPS) {
    tokens[`--color-slate-${stop}`] = toHex(d.ramp[stop])
    tokens[`--color-navy-${stop}`] = toHex(d.ramp[stop])
    tokens[`--color-teal-${stop}`] = toHex(d.accentRamp[stop])
  }
  return { tokens, warnings: resolved.warnings, dark: d.dark }
}

// ----------------------------------------------------------------- storage

export const STORAGE_PREFIX = 'agentlemon.appearance'
export const KEYS = {
  bgDark: `${STORAGE_PREFIX}.bg.dark`,
  bgLight: `${STORAGE_PREFIX}.bg.light`,
  customBgDark: `${STORAGE_PREFIX}.customBg.dark`,
  customBgLight: `${STORAGE_PREFIX}.customBg.light`,
  accent: `${STORAGE_PREFIX}.accent`,
  customAccent: `${STORAGE_PREFIX}.customAccent`,
  /** The mode keeps the key the theme toggle always used. */
  mode: 'agentlemon:theme',
  /** Precomputed variables for the pre-paint script, so it holds no color logic. */
  cache: `${STORAGE_PREFIX}.cache`,
} as const

/** The slice of `Storage` this module needs, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function safeGet(storage: StorageLike | null, key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

function safeSet(
  storage: StorageLike | null,
  key: string,
  value: string,
): void {
  try {
    storage?.setItem(key, value)
  } catch {
    // Blocked or full storage: the choice just will not persist.
  }
}

function safeRemove(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Same as above.
  }
}

/** The browser's localStorage, or null when even touching it throws. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function validChoice(
  list: readonly Preset[],
  value: string | null,
): string | null {
  if (value === CUSTOM) return CUSTOM
  return value && findPreset(list, value) ? value : null
}

function validHex(value: string | null): string | null {
  const rgb = parseHex(value)
  return rgb ? toHex(rgb) : null
}

/** Reads saved choices. Anything missing, invalid, or unreadable falls back to the default. */
export function loadState(storage: StorageLike | null): AppearanceState {
  const mode = safeGet(storage, KEYS.mode)
  return {
    mode: mode === 'light' || mode === 'dark' ? mode : DEFAULT_MODE,
    bg: {
      dark:
        validChoice(DARK_BACKGROUNDS, safeGet(storage, KEYS.bgDark)) ??
        DEFAULT_STATE.bg.dark,
      light:
        validChoice(LIGHT_BACKGROUNDS, safeGet(storage, KEYS.bgLight)) ??
        DEFAULT_STATE.bg.light,
    },
    customBg: {
      dark:
        validHex(safeGet(storage, KEYS.customBgDark)) ??
        DEFAULT_STATE.customBg.dark,
      light:
        validHex(safeGet(storage, KEYS.customBgLight)) ??
        DEFAULT_STATE.customBg.light,
    },
    accent:
      validChoice(ACCENTS, safeGet(storage, KEYS.accent)) ??
      DEFAULT_STATE.accent,
    customAccent:
      validHex(safeGet(storage, KEYS.customAccent)) ??
      DEFAULT_STATE.customAccent,
  }
}

/** Saves everything, including the variable cache for the pre-paint script. */
export function saveState(
  storage: StorageLike | null,
  state: AppearanceState,
): void {
  safeSet(storage, KEYS.mode, state.mode)
  safeSet(storage, KEYS.bgDark, state.bg.dark)
  safeSet(storage, KEYS.bgLight, state.bg.light)
  safeSet(storage, KEYS.customBgDark, state.customBg.dark)
  safeSet(storage, KEYS.customBgLight, state.customBg.light)
  safeSet(storage, KEYS.accent, state.accent)
  safeSet(storage, KEYS.customAccent, state.customAccent)
  const { tokens, dark } = tokensFor(state)
  safeSet(
    storage,
    KEYS.cache,
    JSON.stringify({ mode: state.mode, dark, tokens }),
  )
}

/** Forgets every saved appearance choice, the mode included. */
export function clearAppearance(storage: StorageLike | null): void {
  for (const key of Object.values(KEYS)) safeRemove(storage, key)
}

/** The state "Reset to default" returns to: dark, black, lemon. */
export function resetState(): AppearanceState {
  return DEFAULT_STATE
}

/** What the pre-paint script applies when nothing is saved, for both modes. */
export function defaultTokenSets(): Record<
  Mode,
  { dark: boolean; tokens: Tokens }
> {
  const make = (mode: Mode) => {
    const { tokens, dark } = tokensFor({ ...DEFAULT_STATE, mode })
    return { dark, tokens }
  }
  return { dark: make('dark'), light: make('light') }
}
