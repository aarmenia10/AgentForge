/**
 * Colors of the home page atom, derived from the Appearance variables so every
 * background and accent choice works. Pure: no React and no DOM.
 *
 * The atom is always drawn on a dark stage, because glow does not read on a
 * light page: in dark mode the stage is the page itself, in light mode it is a
 * dark rounded panel. So every scene color is chosen against the stage.
 *
 * The nucleus is warm (the accent, a deeper neighbour of it, and a glossy
 * graphite). Agents get a hue turned away from the accent; skills are a cool
 * white. Orbits come in two tones: a pale version of the agent hue and a pale
 * version of the accent.
 */
import {
  contrast,
  ensureContrast,
  isDarkColor,
  mix,
  parseHex,
  type Rgb,
} from './appearance'

export interface AtomPalette {
  /** The page background. */
  bg: Rgb
  accent: Rgb
  /** What the atom is drawn on: the page in dark mode, a dark panel in light mode. */
  stage: Rgb
  /** Glossy nucleon tones: the accent, a deeper neighbour, and graphite. */
  nucleons: readonly [Rgb, Rgb, Rgb]
  agent: Rgb
  skill: Rgb
  /** Orbit tones: cool (from the agent hue) and warm (from the accent). */
  ringCool: Rgb
  ringWarm: Rgb
  /** The page is dark. In light mode the atom sits on its own dark stage. */
  dark: boolean
}

const WHITE: Rgb = [255, 255, 255]
/** The light-mode stage: near black with a faint cool cast. */
export const LIGHT_MODE_STAGE: Rgb = [10, 11, 16]
const SKILL: Rgb = [236, 242, 250]
const GRAPHITE: Rgb = [44, 44, 52]
const MIN_SEPARATION = 100
const MIN_CONTRAST = 3

function hexOr(tokens: Record<string, string>, name: string, fallback: Rgb) {
  return parseHex(tokens[name]) ?? fallback
}

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
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

/** The agent color for an accent, a dark stage, and the skill color. */
export function agentColor(accent: Rgb, stage: Rgb, skill: Rgb): Rgb {
  const [h, s] = toHsl(accent)
  let best: Rgb = mix(accent, skill, 0.5)
  // A little short of the opposite hue first (lemon gives an electric azure
  // rather than a periwinkle), then neighbours, until the color stands apart.
  for (const turn of [165, 180, 130, 230, 90, 270]) {
    const candidate = ensureContrast(
      fromHsl((h + turn) % 360, Math.max(s, 0.62), 0.64),
      [stage],
      MIN_CONTRAST,
      WHITE,
    )
    best = candidate
    if (
      distance(candidate, accent) >= MIN_SEPARATION &&
      distance(candidate, skill) >= MIN_SEPARATION &&
      contrast(candidate, stage) >= MIN_CONTRAST
    )
      return candidate
  }
  return best
}

/** Builds the palette from `tokensFor(state).tokens`. */
export function atomPalette(tokens: Record<string, string>): AtomPalette {
  const bg = hexOr(tokens, '--lm-bg', [10, 10, 10])
  const accent = hexOr(tokens, '--lm-accent', [250, 214, 40])
  const dark = isDarkColor(bg)
  const stage = dark ? bg : LIGHT_MODE_STAGE
  const agent = agentColor(accent, stage, SKILL)
  const [h, s, l] = toHsl(accent)
  return {
    bg,
    accent,
    stage,
    nucleons: [
      accent,
      fromHsl((h + 346) % 360, Math.min(1, s * 1.05), l * 0.62),
      GRAPHITE,
    ],
    agent,
    skill: SKILL,
    ringCool: mix(agent, WHITE, 0.3),
    ringWarm: mix(accent, WHITE, 0.2),
    dark,
  }
}
