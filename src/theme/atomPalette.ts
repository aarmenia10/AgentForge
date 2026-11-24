/**
 * Colors of the home page atom, derived from the Appearance variables so every
 * background and accent choice works. Pure: no React and no DOM.
 *
 * The nucleus is the accent. Skills use the page text color. Agents use a hue
 * turned away from the accent, kept at 3:1 contrast against the background
 * (WCAG non-text contrast) and clearly different from both of the others.
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
  bg: Rgb
  text: Rgb
  accent: Rgb
  /** Black or white, readable on the accent: the "Council" label color. */
  accentInk: Rgb
  agent: Rgb
  skill: Rgb
  /** Orbital rings: a quiet line between the page and its text. */
  ring: Rgb
  dark: boolean
}

const BLACK: Rgb = [0, 0, 0]
const WHITE: Rgb = [255, 255, 255]
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

/** The agent color for an accent, page, and text color. */
export function agentColor(accent: Rgb, bg: Rgb, text: Rgb): Rgb {
  const dark = isDarkColor(bg)
  const [h, s] = toHsl(accent)
  const toward = dark ? WHITE : BLACK
  let best: Rgb = mix(accent, text, 0.5)
  // Try the opposite hue first, then neighbours, until the color stands apart.
  for (const turn of [180, 130, 230, 90, 270]) {
    const candidate = ensureContrast(
      fromHsl((h + turn) % 360, Math.max(s, 0.62), dark ? 0.66 : 0.4),
      [bg],
      MIN_CONTRAST,
      toward,
    )
    best = candidate
    if (
      distance(candidate, accent) >= MIN_SEPARATION &&
      distance(candidate, text) >= MIN_SEPARATION &&
      contrast(candidate, bg) >= MIN_CONTRAST
    )
      return candidate
  }
  return best
}

/** Builds the palette from `tokensFor(state).tokens`. */
export function atomPalette(tokens: Record<string, string>): AtomPalette {
  const bg = hexOr(tokens, '--lm-bg', [10, 10, 10])
  const text = hexOr(tokens, '--lm-text', [246, 246, 246])
  const accent = hexOr(tokens, '--lm-accent', [250, 214, 40])
  const accentInk = hexOr(tokens, '--lm-accent-ink', BLACK)
  return {
    bg,
    text,
    accent,
    accentInk,
    agent: agentColor(accent, bg, text),
    skill: text,
    ring: mix(bg, text, 0.38),
    dark: isDarkColor(bg),
  }
}
