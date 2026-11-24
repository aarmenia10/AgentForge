import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ACCENTS,
  CUSTOM,
  DARK_BACKGROUNDS,
  DEFAULT_STATE,
  LIGHT_BACKGROUNDS,
  contrast,
  mix,
  parseHex,
  tokensFor,
  type AppearanceState,
  type Mode,
  type Rgb,
} from '../src/theme/appearance'
import {
  CUP,
  CUPS,
  LEMON,
  PARTS,
  PRISM,
  PRISM_EXITS,
  STREAMS,
  VIEW,
  cupHalfWidthAt,
  distanceToPolyline,
  offsetPolyline,
  partAt,
  polylineLength,
  roundedPath,
  surfaceY,
} from '../src/components/home/sceneGeometry'
import {
  GLASS_MIN_CONTRAST,
  MIN_GLOW_CONTRAST,
  homeGlass,
  scenePalette,
} from '../src/components/home/scenePalette'
import { squeezeAmount } from '../src/components/home/sceneMotion'

const ROOT = resolve(import.meta.dirname, '..')

/** Every preset background in both modes with every preset accent, plus a few custom ones. */
function allStates(): AppearanceState[] {
  const states: AppearanceState[] = []
  const modes: [Mode, readonly { id: string }[]][] = [
    ['dark', DARK_BACKGROUNDS],
    ['light', LIGHT_BACKGROUNDS],
  ]
  for (const [mode, backgrounds] of modes)
    for (const bg of backgrounds)
      for (const accent of [...ACCENTS.map((a) => a.id), CUSTOM])
        for (const customAccent of ['#1d4ed8', '#0b1d3a', '#ffffff'])
          states.push({
            ...DEFAULT_STATE,
            mode,
            bg: { ...DEFAULT_STATE.bg, [mode]: bg.id },
            accent,
            customAccent,
          })
  return states
}

const rgb = (hex: string): Rgb => {
  const parsed = parseHex(hex)
  assert.ok(parsed, `${hex} is a color`)
  return parsed
}

test('the scene is drawn on a dark stage in both modes', () => {
  for (const state of allStates()) {
    const p = scenePalette(tokensFor(state).tokens)
    assert.equal(p.dark, state.mode === 'dark')
    // Glow needs darkness: the stage is the page in dark mode, near black in light.
    assert.ok(
      contrast(rgb(p.stage), [255, 255, 255]) > 12,
      `${state.mode}/${state.bg[state.mode]} stage is dark`,
    )
  }
})

test('the lemon and juice glow against the stage for every accent', () => {
  for (const state of allStates()) {
    const p = scenePalette(tokensFor(state).tokens)
    const label = `${state.mode}/${state.bg[state.mode]}/${state.accent}/${state.customAccent}`
    assert.ok(
      contrast(rgb(p.accent), rgb(p.stage)) >= MIN_GLOW_CONTRAST - 0.01,
      `${label}: accent glows`,
    )
    assert.ok(
      contrast(rgb(p.accentLight), rgb(p.stage)) >
        contrast(rgb(p.accent), rgb(p.stage)) - 0.01,
      `${label}: the lit side is brighter`,
    )
    // Neutrals run from faint to strong, so lines, glass, and labels read in order.
    const order = [
      p.stage,
      p.metal,
      p.line,
      p.metalLight,
      p.lineStrong,
      p.label,
    ]
    for (let i = 1; i < order.length; i++)
      assert.ok(
        contrast(rgb(order[i]), rgb(p.stage)) >=
          contrast(rgb(order[i - 1]), rgb(p.stage)),
        `${label}: neutral ${i} is brighter than ${i - 1}`,
      )
  }
})

test('the scene uses the accent, not a fixed lemon', () => {
  const lemon = scenePalette(tokensFor(DEFAULT_STATE).tokens)
  const purple = scenePalette(
    tokensFor({ ...DEFAULT_STATE, accent: 'purple' }).tokens,
  )
  assert.equal(lemon.accent, '#fad628')
  assert.equal(purple.accent, '#6142ff')
  assert.notEqual(lemon.accentDeep, purple.accentDeep)
  // Neutrals do not change with the accent.
  assert.equal(lemon.line, purple.line)
})

test('see-through cards keep AA text over anything in the scene', () => {
  for (const state of allStates()) {
    const tokens = tokensFor(state).tokens
    const glass = homeGlass(tokens)
    const p = scenePalette(tokens)
    const surface = rgb(tokens['--lm-surface'])
    const label = `${state.mode}/${state.bg[state.mode]}/${state.accent}/${state.customAccent}`
    assert.ok(
      glass.alpha >= 0.7 && glass.alpha <= 1,
      `${label}: ${glass.alpha}`,
    )
    assert.match(glass.fill, /^rgb\(\d+ \d+ \d+ \/ 0?\.\d+|1\)$/)
    for (const under of [
      [255, 255, 255] as Rgb,
      rgb(p.stage),
      rgb(p.accent),
      rgb(p.accentLight),
      rgb(tokens['--lm-bg']),
    ]) {
      const seen = mix(under, surface, glass.alpha)
      for (const name of ['--lm-text', '--lm-muted', '--lm-accent-text'])
        assert.ok(
          contrast(rgb(tokens[name]), seen) >= GLASS_MIN_CONTRAST,
          `${label}: ${name} on glass over ${under.join(',')}`,
        )
    }
  }
})

test('the default cards are clearly see-through, not just solid', () => {
  const dark = homeGlass(tokensFor(DEFAULT_STATE).tokens)
  const light = homeGlass(tokensFor({ ...DEFAULT_STATE, mode: 'light' }).tokens)
  assert.ok(dark.alpha <= 0.9, `dark ${dark.alpha}`)
  assert.ok(light.alpha <= 0.95, `light ${light.alpha}`)
})

test('cups link to Agents, Skills, and Councils, left to right', () => {
  assert.deepEqual(
    CUPS.map((cup) => [cup.label, cup.to]),
    [
      ['Agents', '/agents'],
      ['Skills', '/skills'],
      ['Councils', '/councils'],
    ],
  )
  for (let i = 1; i < CUPS.length; i++) assert.ok(CUPS[i].cx > CUPS[i - 1].cx)
})

test('each stream runs from the prism into its own cup, ending on the juice', () => {
  assert.equal(STREAMS.length, CUPS.length)
  STREAMS.forEach((line, i) => {
    const cup = CUPS[i]
    const start = line[0]
    const end = line[line.length - 1]
    assert.deepEqual(start, PRISM_EXITS[i])
    assert.equal(end[0], cup.cx)
    assert.equal(end[1], surfaceY(cup.level))
    // The juice sits inside the glass, below the rim.
    assert.ok(end[1] > CUP.top && end[1] < CUP.bottom)
    assert.ok(polylineLength(line) > 100)
    // Every point stays inside the drawing.
    for (const [x, y] of line)
      assert.ok(x >= 0 && x <= VIEW.w && y >= 0 && y <= VIEW.h)
  })
})

test('parallel stream lines stay parallel around the bend', () => {
  const line = STREAMS[0]
  // Each offset segment lies 7 units from the line through its original segment.
  const fromLine = (
    p: readonly number[],
    a: readonly number[],
    b: readonly number[],
  ) =>
    Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) /
    Math.hypot(b[0] - a[0], b[1] - a[1])
  for (const d of [7, -7]) {
    const moved = offsetPolyline(line, d)
    for (let i = 1; i < line.length; i++)
      for (const p of [moved[i - 1], moved[i]])
        assert.ok(Math.abs(fromLine(p, line[i - 1], line[i]) - 7) < 0.01)
  }
  // The ends sit exactly 7 from the stream.
  assert.ok(
    Math.abs(distanceToPolyline(offsetPolyline(line, 7)[0], line) - 7) < 0.01,
  )
  assert.deepEqual(
    offsetPolyline(line, 0),
    line.map((p) => [...p]),
  )
})

test('rounded paths are well formed', () => {
  const d = roundedPath(STREAMS[0], 46)
  assert.match(d, /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ Q/)
  assert.doesNotMatch(d, /NaN|Infinity/)
  assert.equal(roundedPath(STREAMS[1], 46).includes('Q'), false)
})

test('the pointer finds each part, and nothing in empty space', () => {
  assert.equal(partAt(LEMON[0], LEMON[1]), 'lemon')
  assert.equal(partAt(PRISM.apex[0], PRISM.apex[1] + 70), 'prism')
  CUPS.forEach((cup, i) => {
    assert.equal(partAt(cup.cx, (CUP.top + CUP.bottom) / 2), `cup-${i}`)
    // The pedestal and the label under it count as the cup.
    assert.equal(partAt(cup.cx, 940), `cup-${i}`)
  })
  STREAMS.forEach((line, i) => {
    const a = line[line.length - 2]
    const b = line[line.length - 1]
    const mid: [number, number] = [
      (a[0] + b[0]) / 2,
      Math.min((a[1] + b[1]) / 2, CUP.top - 40),
    ]
    if (i !== 1) assert.equal(partAt(mid[0], mid[1]), `stream-${i}`)
  })
  assert.equal(partAt(20, 20), null)
  assert.equal(partAt(980, 500), null)
  for (const part of PARTS)
    assert.match(part, /^(lemon|prism|cup-\d|stream-\d)$/)
})

test('the cup narrows towards its base', () => {
  assert.equal(cupHalfWidthAt(CUP.top), CUP.topHalf)
  assert.equal(cupHalfWidthAt(CUP.bottom), CUP.bottomHalf)
})

test('a squeeze closes the press, holds, and springs back open', () => {
  assert.equal(squeezeAmount(-1), 0)
  assert.ok(squeezeAmount(0.08) > 0.5)
  assert.equal(squeezeAmount(0.2), 1)
  assert.ok(Math.abs(squeezeAmount(0.9)) < 0.05)
  assert.equal(squeezeAmount(2), 0)
})

test('the old atom is gone', () => {
  const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
  assert.doesNotMatch(css, /nebula/)
  const hero = readFileSync(join(ROOT, 'src', 'components', 'Hero.tsx'), 'utf8')
  assert.doesNotMatch(hero, /atom/i)
})

test('only every-day hover highlights exist for real parts', () => {
  // Each part in the hit test has a CSS rule that lights it up.
  const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
  for (const part of PARTS)
    assert.ok(
      css.includes(`[data-hot='${part}'] .lp-hot-${part}`),
      `no highlight rule for ${part}`,
    )
})
