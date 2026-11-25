import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HomeBackdrop } from '../src/components/home/HomeBackdrop'
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
  HANDLE,
  FRAME,
  TIPS,
  TOP_SPOUTS,
  SPOUT_LENGTH,
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

test('each palette uses the page itself as its stage with readable labels', () => {
  for (const state of allStates()) {
    const { tokens } = tokensFor(state)
    const p = scenePalette(tokens)
    assert.equal(p.dark, state.mode === 'dark')
    assert.equal(p.stage, tokens['--lm-bg'])
    for (const ink of [p.ink, p.label])
      assert.ok(contrast(rgb(ink), rgb(p.stage)) >= 4.5)
    if (!p.dark) assert.ok(contrast(rgb(p.lineStrong), rgb(p.stage)) >= 3)
  }
})

test('reduced motion removes the whole backdrop including its link layer', () => {
  assert.equal(
    renderToStaticMarkup(createElement(HomeBackdrop, { reduced: true })),
    '',
  )
  assert.match(
    renderToStaticMarkup(createElement(HomeBackdrop, { reduced: false })),
    /lp-box/,
  )
})

test('the lemon and juice glow against the stage for every accent', () => {
  for (const state of allStates()) {
    const p = scenePalette(tokensFor(state).tokens)
    if (!p.dark) continue
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

test('glass is as close to half opacity as AA allows for the home text tones', () => {
  for (const state of allStates()) {
    const tokens = tokensFor(state).tokens
    const glass = homeGlass(tokens)
    const palette = scenePalette(tokens)
    const surface = rgb(tokens['--lm-surface'])
    const colors = Object.values(palette)
      .filter((v): v is string => typeof v === 'string')
      .map(rgb)
    const limit = (i: number) =>
      (palette.dark ? Math.max : Math.min)(...colors.map((color) => color[i]))
    const extreme: Rgb = [limit(0), limit(1), limit(2)]
    const body = rgb(tokens['--lm-text'])
    assert.ok(glass.alpha >= 0.5 && glass.alpha <= 1)
    assert.equal(glass.fill, `rgb(${surface.join(' ')} / ${glass.alpha})`)
    for (const under of [extreme, ...colors]) {
      const seen = mix(under, surface, glass.alpha)
      for (const color of [body, rgb(glass.muted), rgb(glass.accentText)]) {
        assert.ok(contrast(color, seen) >= GLASS_MIN_CONTRAST)
      }
    }
    if (glass.alpha > 0.5) {
      const previous = mix(extreme, surface, glass.alpha - 0.01)
      const ink: Rgb = palette.dark ? [255, 255, 255] : [0, 0, 0]
      const strongest = [
        body,
        ...['--lm-muted', '--lm-accent-text'].map((name) =>
          mix(rgb(tokens[name]), ink, 0.75),
        ),
      ]
      assert.ok(
        strongest.some(
          (color) => contrast(color, previous) < GLASS_MIN_CONTRAST,
        ),
      )
    }
  }
})

test('two lemon tips feed the upper cups, which drain into the inverted triangle', () => {
  assert.equal(TIPS.length, 2)
  assert.equal(TIPS[0][1], TIPS[1][1])
  assert.ok(TIPS[0][0] < LEMON[0] && TIPS[1][0] > LEMON[0])
  assert.deepEqual(
    CUPS.map((c) => [c.label, c.to]),
    [
      ['Agents', '/agents'],
      ['Skills', '/skills'],
      ['Councils', '/councils'],
    ],
  )
  assert.equal(CUPS[0].top, CUPS[1].top)
  assert.equal(PRISM.left[1], PRISM.right[1])
  assert.ok(PRISM.apex[1] > PRISM.left[1])
  assert.equal(STREAMS.length, 3)
  TIPS.forEach(([x, y], i) => {
    const cup = CUPS[i]
    assert.equal(x, cup.cx)
    assert.ok(y < cup.top)
    assert.deepEqual(TOP_SPOUTS[i], [
      cup.cx,
      cup.top + CUP.height + SPOUT_LENGTH,
    ])
    assert.deepEqual(STREAMS[i][0], TOP_SPOUTS[i])
    assert.deepEqual(STREAMS[i].at(-1), i === 0 ? PRISM.left : PRISM.right)
    assert.ok(TOP_SPOUTS[i][1] < PRISM.left[1])
  })
  assert.equal(CUPS[2].cx, PRISM.apex[0])
  assert.ok(CUPS[2].top > PRISM.apex[1])
  assert.deepEqual(STREAMS[2], [PRISM.apex, [CUPS[2].cx, surfaceY(CUPS[2])]])
  for (const line of STREAMS) {
    assert.ok(polylineLength(line) > 90)
    for (const [x, y] of line)
      assert.ok(x > 0 && x < VIEW.w && y > 0 && y < VIEW.h)
  }
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
  assert.equal(roundedPath(STREAMS[2], 46).includes('Q'), false)
})

test('the pointer finds each part, and nothing in empty space', () => {
  assert.equal(partAt(LEMON[0], LEMON[1]), 'lemon')
  assert.equal(partAt(...HANDLE), 'lemon')
  assert.equal(partAt(FRAME.left, 185), 'lemon')
  assert.equal(partAt(PRISM.apex[0], PRISM.apex[1] - 55), 'prism')
  CUPS.forEach((cup, i) => {
    assert.equal(partAt(cup.cx, cup.top + CUP.height / 2), `cup-${i}`)
  })
  assert.equal(partAt(CUPS[2].cx, 940), 'cup-2')
  for (let i = 0; i < 3; i++) {
    const a = STREAMS[i][0]
    assert.equal(partAt(a[0], a[1] + 30), `stream-${i}`)
  }
  assert.equal(partAt(20, 20), null)
  assert.equal(partAt(980, 500), null)
  for (const part of PARTS)
    assert.match(part, /^(lemon|prism|cup-\d|stream-\d)$/)
})

test('the cup narrows towards its base', () => {
  assert.equal(cupHalfWidthAt(CUPS[0], CUPS[0].top), CUP.topHalf)
  assert.equal(
    cupHalfWidthAt(CUPS[0], CUPS[0].top + CUP.height),
    CUP.bottomHalf,
  )
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
