/**
 * Colors of the home page lemon press, derived from the Appearance variables
 * (`tokensFor(state).tokens`) so every mode, background, and accent works.
 * Pure: no React and no DOM.
 *
 * The scene is always drawn on a dark stage, because glow does not read on a
 * light page: in dark mode the stage is the page itself, in light mode it is
 * a soft patch of near black behind the scene. So every scene color is chosen
 * against the stage. The lemon and the juice use the accent; the press, the
 * glass, the lines, and the marks are neutrals mixed from the stage and white.
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
/** The light-mode stage: near black with a faint cool cast. */
export const LIGHT_MODE_STAGE: Rgb = [11, 12, 17]
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
  /** The page is dark. In light mode the scene sits on its own dark patch. */
  dark: boolean
  bg: string
  /** What the scene is drawn on. */
  stage: string
  /** The lemon and the juice. */
  accent: string
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
  const stage = dark ? bg : LIGHT_MODE_STAGE
  // A dark custom accent would vanish on the stage; lift it until it glows.
  const accent = ensureContrast(rawAccent, [stage], MIN_GLOW_CONTRAST, WHITE)
  const [h, s, l] = toHsl(accent)
  const deep = fromHsl((h + 346) % 360, Math.min(1, s * 1.05), l * 0.6)
  return {
    dark,
    bg: toHex(bg),
    stage: toHex(stage),
    accent: toHex(accent),
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
const GLASS_FLOOR = 0.7

export interface HomeGlass {
  /** Share of the card's own surface color, 0 to 1. The rest is the scene. */
  alpha: number
  /** CSS color for the surface. */
  fill: string
}

/**
 * The see-through surface of the home page's cards and panels. The scene can
 * be anything under a card, from the stage to a white highlight, so the
 * surface is made just opaque enough that body text, muted text, and accent
 * text keep AA contrast over the worst of them. The backdrop blur only makes
 * this safer, and browsers without it get the same numbers.
 */
export function homeGlass(tokens: Record<string, string>): HomeGlass {
  const bg = hexOr(tokens, '--lm-bg', [10, 10, 10])
  const surface = hexOr(tokens, '--lm-surface', [30, 30, 30])
  const texts = [
    hexOr(tokens, '--lm-text', [246, 246, 246]),
    hexOr(tokens, '--lm-muted', [179, 179, 179]),
    hexOr(tokens, '--lm-accent-text', [250, 214, 40]),
  ]
  const palette = scenePalette(tokens)
  const backdrops = [
    WHITE,
    bg,
    parseHex(palette.stage) ?? bg,
    parseHex(palette.accent) ?? bg,
    parseHex(palette.accentLight) ?? WHITE,
  ]
  const readable = (a: number) =>
    backdrops.every((under) => {
      const seen = mix(under, surface, a)
      return texts.every((text) => contrast(text, seen) >= GLASS_MIN_CONTRAST)
    })
  // Whole steps of 1%, so the loop cannot drift; fully opaque if nothing passes.
  let step = Math.round(GLASS_FLOOR * 100)
  while (step < 100 && !readable(step / 100)) step++
  const alpha = step / 100
  return {
    alpha,
    fill: `rgb(${surface.join(' ')} / ${alpha})`,
  }
}
