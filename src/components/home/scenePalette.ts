/**
 * Colors of the home page lemon press, derived from the Appearance variables
 * (`tokensFor(state).tokens`) so every mode, background, and accent works.
 * Pure: no React and no DOM.
 *
 * The page itself is the stage. Dark mode uses luminous edges. In light mode
 * ink outlines, deeper juice and cool gray glass give the drawing definition.
 */
import {
  contrast,
  ensureContrast,
  isDarkColor,
  mix,
  parseHex,
  toHex,
  type Rgb,
} from '@/theme/appearance'

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]
/** The accent must stand out from the stage at least this much to glow. */
export const MIN_GLOW_CONTRAST = 3

function hexOr(tokens: Record<string, string>, name: string, fallback: Rgb) {
  return parseHex(tokens[name]) ?? fallback
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4
  return [h * 60, s, l]
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ]
}

export interface ScenePalette {
  /** Selects luminous or inked details. */
  dark: boolean
  bg: string
  /** What the scene is drawn on. */
  stage: string
  /** The lemon and the juice. */
  accent: string
  ink: string
  juice: string
  /** The lit side of the lemon, juice surfaces, drops' highlights. */
  accentLight: string
  /** The shaded side: a deeper, slightly warmer neighbour of the accent. */
  accentDeep: string
  /** Faint circuit lines and the grid. */
  line: string
  /** Glass edges and the press outline. */
  lineStrong: string
  /** Small marks and labels. */
  label: string
  /** The press arms and pedestals. */
  metal: string
  metalLight: string
}

/** The scene's colors for the current Appearance tokens. */
export function scenePalette(tokens: Record<string, string>): ScenePalette {
  const bg = hexOr(tokens, '--lm-bg', [10, 10, 10])
  const rawAccent = hexOr(tokens, '--lm-accent', [250, 214, 40])
  const dark = isDarkColor(bg)
  const stage = bg
  if (!dark) {
    const [h, s, l] = toHsl(rawAccent)
    const rind = fromHsl(h, s, Math.min(0.58, Math.max(0.4, l)))
    const juice = fromHsl((h + 351) % 360, s, 0.39)
    const gray: Rgb = [45, 56, 65]
    return {
      dark,
      bg: toHex(bg),
      stage: toHex(stage),
      accent: toHex(rind),
      accentLight: toHex(mix(rind, WHITE, 0.34)),
      accentDeep: toHex(fromHsl((h + 350) % 360, s, 0.32)),
      ink: toHex(ensureContrast(juice, [bg], 4.5, BLACK)),
      juice: toHex(juice),
      line: toHex(mix(bg, gray, 0.22)),
      lineStrong: toHex(mix(bg, gray, 0.76)),
      metal: toHex(mix(bg, gray, 0.25)),
      metalLight: toHex(mix(bg, gray, 0.12)),
      label: toHex(ensureContrast(gray, [bg], 5, BLACK)),
    }
  }
  // A dark custom accent would vanish on the stage; lift it until it glows.
  const accent = ensureContrast(rawAccent, [stage], MIN_GLOW_CONTRAST, WHITE)
  const [h, s, l] = toHsl(accent)
  const deep = fromHsl((h + 346) % 360, Math.min(1, s * 1.05), l * 0.6)
  return {
    dark,
    bg: toHex(bg),
    stage: toHex(stage),
    accent: toHex(accent),
    ink: toHex(ensureContrast(accent, [bg], 4.5, WHITE)),
    juice: toHex(accent),
    accentLight: toHex(mix(accent, WHITE, 0.55)),
    accentDeep: toHex(
      contrast(deep, stage) < 1.6 ? mix(accent, BLACK, 0.3) : deep,
    ),
    line: toHex(mix(stage, WHITE, 0.2)),
    lineStrong: toHex(mix(stage, WHITE, 0.5)),
    label: toHex(mix(stage, WHITE, 0.6)),
    metal: toHex(mix(stage, WHITE, 0.13)),
    metalLight: toHex(mix(stage, WHITE, 0.32)),
  }
}

// ------------------------------------------------------------- glass cards

/** What the cards' text must reach on the see-through surface. */
export const GLASS_MIN_CONTRAST = 4.5
const GLASS_FLOOR = 0.5

export interface HomeGlass {
  /** Share of the card's own surface color, 0 to 1. The rest is the scene. */
  alpha: number
  /** CSS color for the surface. */
  fill: string
  muted: string
  accentText: string
}

/**
 * Start at half surface, half blurred artwork. Blending and blurring the SVG
 * keep each color channel within its palette's bounds. Use stronger home-card
 * text tones when needed, retaining at least 25% of their original color. Raise the
 * surface by one percentage point only if those tones still cannot reach AA.
 */
export function homeGlass(tokens: Record<string, string>): HomeGlass {
  const surface = hexOr(tokens, '--lm-surface', [30, 30, 30])
  const body = hexOr(tokens, '--lm-text', [246, 246, 246])
  const muted = hexOr(tokens, '--lm-muted', [179, 179, 179])
  const accentText = hexOr(tokens, '--lm-accent-text', [250, 214, 40])
  const palette = scenePalette(tokens)
  const ink = palette.dark ? WHITE : BLACK
  const colors = Object.values(palette)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => parseHex(v)!)
  // Even at the brightest (or darkest) edge of the blur, every text must pass.
  const bound = (i: number) =>
    (palette.dark ? Math.max : Math.min)(...colors.map((c) => c[i]))
  const extreme: Rgb = [bound(0), bound(1), bound(2)]
  const tones = [body, mix(muted, ink, 0.75), mix(accentText, ink, 0.75)]
  let step = GLASS_FLOOR * 100
  let seen = mix(extreme, surface, step / 100)
  while (
    step < 100 &&
    tones.some((color) => contrast(color, seen) < GLASS_MIN_CONTRAST)
  ) {
    seen = mix(extreme, surface, ++step / 100)
  }
  const alpha = step / 100
  return {
    alpha,
    fill: `rgb(${surface.join(' ')} / ${alpha})`,
    muted: toHex(ensureContrast(muted, [seen], GLASS_MIN_CONTRAST, ink)),
    accentText: toHex(
      ensureContrast(accentText, [seen], GLASS_MIN_CONTRAST, ink),
    ),
  }
}
