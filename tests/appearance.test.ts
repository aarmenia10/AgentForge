import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCENTS,
  DARK_BACKGROUNDS,
  DEFAULT_STATE,
  KEYS,
  LIGHT_BACKGROUNDS,
  contrast,
  defaultTokenSets,
  derive,
  findPreset,
  guardAccent,
  guardBackground,
  loadState,
  parseHex,
  resolveColors,
  resetState,
  saveState,
  textOnAccent,
  tokensFor,
  type AppearanceState,
  type Mode,
  type Rgb,
  type StorageLike,
} from '../src/theme/appearance'

function memoryStorage(
  initial: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

/** Storage whose every call throws, like a browser with site data blocked. */
const throwingStorage: StorageLike = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('blocked')
  },
  removeItem() {
    throw new Error('blocked')
  },
}

const state = (patch: Partial<AppearanceState>): AppearanceState => ({
  ...DEFAULT_STATE,
  ...patch,
})

test('preset lookup finds the owner-chosen colors', () => {
  assert.deepEqual(findPreset(DARK_BACKGROUNDS, 'black')?.rgb, [10, 10, 10])
  assert.deepEqual(findPreset(DARK_BACKGROUNDS, 'charcoal')?.rgb, [24, 24, 27])
  assert.deepEqual(findPreset(DARK_BACKGROUNDS, 'midnight')?.rgb, [12, 18, 34])
  assert.deepEqual(findPreset(LIGHT_BACKGROUNDS, 'cream')?.rgb, [250, 247, 240])
  assert.deepEqual(
    findPreset(LIGHT_BACKGROUNDS, 'soft-gray')?.rgb,
    [244, 244, 245],
  )
  assert.deepEqual(findPreset(ACCENTS, 'lemon')?.rgb, [250, 214, 40])
  assert.deepEqual(findPreset(ACCENTS, 'purple')?.rgb, [97, 66, 255])
  assert.equal(findPreset(ACCENTS, 'nope'), undefined)
  // Light backgrounds are not offered in dark mode and the reverse.
  assert.equal(findPreset(DARK_BACKGROUNDS, 'white'), undefined)
})

test('defaults are dark, black, and lemon', () => {
  const { bg, accent } = resolveColors(DEFAULT_STATE)
  assert.deepEqual(bg, [10, 10, 10])
  assert.deepEqual(accent, [250, 214, 40])
  assert.equal(DEFAULT_STATE.mode, 'dark')
  const light = resolveColors({ ...DEFAULT_STATE, mode: 'light' })
  assert.deepEqual(light.bg, [255, 255, 255])
  assert.deepEqual(light.accent, [250, 214, 40])
})

test('text on accent is black or white, whichever contrasts more', () => {
  assert.deepEqual(textOnAccent([250, 214, 40]), [0, 0, 0])
  assert.deepEqual(textOnAccent([97, 66, 255]), [255, 255, 255])
  assert.deepEqual(textOnAccent([255, 255, 255]), [0, 0, 0])
  assert.deepEqual(textOnAccent([0, 0, 0]), [255, 255, 255])
  // Whatever the accent, the pick reaches AA for normal text.
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 51) {
      for (let b = 0; b <= 255; b += 51) {
        const fill: Rgb = [r, g, b]
        assert.ok(contrast(fill, textOnAccent(fill)) >= 4.5, `rgb(${fill})`)
      }
    }
  }
})

test('contrast ratio matches the WCAG reference values', () => {
  assert.equal(Math.round(contrast([0, 0, 0], [255, 255, 255])), 21)
  assert.equal(contrast([255, 255, 255], [255, 255, 255]), 1)
})

test('contrast guard moves a custom accent that is too close to the background', () => {
  const darkBg: Rgb = [10, 10, 10]
  const tooDark = guardAccent([20, 20, 20], darkBg)
  assert.ok(tooDark.warning, 'warns')
  assert.ok(contrast(tooDark.rgb, darkBg) >= 3)
  // It lightened, because the page is dark.
  assert.ok(tooDark.rgb[0] > 20)

  const lightBg: Rgb = [255, 255, 255]
  const tooLight = guardAccent([250, 250, 200], lightBg)
  assert.ok(tooLight.warning, 'warns')
  assert.ok(contrast(tooLight.rgb, lightBg) >= 3)
  assert.ok(tooLight.rgb[0] < 250)

  const fine = guardAccent([97, 66, 255], darkBg)
  assert.equal(fine.warning, null)
  assert.deepEqual(fine.rgb, [97, 66, 255])
})

test('the guard runs on a custom accent chosen in the app state', () => {
  const resolved = resolveColors(
    state({ accent: 'custom', customAccent: '#111111' }),
  )
  assert.equal(resolved.warnings.length, 1)
  assert.ok(contrast(resolved.accent, resolved.bg) >= 3)
  const { warnings } = tokensFor(
    state({ accent: 'custom', customAccent: '#111111' }),
  )
  assert.equal(warnings.length, 1)
})

test('a custom background stays on the right side of its mode', () => {
  assert.equal(guardBackground([20, 20, 30], 'dark').warning, null)
  const lightInDark = guardBackground([240, 240, 240], 'dark')
  assert.ok(lightInDark.warning)
  assert.ok(lightInDark.rgb[0] < 120)
  const darkInLight = guardBackground([20, 20, 30], 'light')
  assert.ok(darkInLight.warning)
  assert.ok(darkInLight.rgb[0] > 150)
})

const ACCENT_CHOICES = [...ACCENTS.map((preset) => preset.id), 'custom']

function allCombinations(): AppearanceState[] {
  const combos: AppearanceState[] = []
  const customs: Record<Mode, string[]> = {
    dark: ['#2a1a40', '#1a3a2a'],
    light: ['#ffe9a0', '#d0e0ff'],
  }
  for (const mode of ['dark', 'light'] as const) {
    const presets = mode === 'dark' ? DARK_BACKGROUNDS : LIGHT_BACKGROUNDS
    const choices = [
      ...presets.map((preset) => ({ id: preset.id, hex: '' })),
      ...customs[mode].map((hex) => ({ id: 'custom', hex })),
    ]
    for (const bg of choices) {
      for (const accent of ACCENT_CHOICES) {
        combos.push({
          ...DEFAULT_STATE,
          mode,
          bg: { ...DEFAULT_STATE.bg, [mode]: bg.id },
          customBg: {
            ...DEFAULT_STATE.customBg,
            [mode]: bg.hex || DEFAULT_STATE.customBg[mode],
          },
          accent,
          customAccent: '#e11d9a',
        })
      }
    }
  }
  return combos
}

test('text passes AA (4.5:1) in every preset and custom combination', () => {
  const combos = allCombinations()
  assert.ok(combos.length > 60)
  for (const combo of combos) {
    const resolved = resolveColors(combo)
    const d = derive(
      resolved.bg,
      resolved.accent,
      combo.mode,
      resolved.accentLightSeed,
    )
    const label = `${combo.mode} bg=${combo.bg[combo.mode]} accent=${combo.accent}`
    const check = (name: string, fg: Rgb, bgs: Rgb[], min = 4.5) => {
      for (const bg of bgs) {
        const ratio = contrast(fg, bg)
        assert.ok(
          ratio >= min,
          `${label}: ${name} ${ratio.toFixed(2)} on rgb(${bg})`,
        )
      }
    }
    check('text', d.text, [d.bg, d.surface])
    check('muted', d.muted, [d.bg, d.surface, d.surface2])
    check('accent text', d.accentText, [d.bg, d.surface, d.surface2])
    check('text on accent', d.accentInk, [d.accent])
    // Legacy slate classes on pages that were not restyled. Light pages use
    // 500 and up for text; dark pages use 300 and 400.
    if (combo.mode === 'light') {
      for (const stop of [500, 600, 700, 800, 900])
        check(`slate-${stop}`, d.ramp[stop], [d.bg, d.surface])
      // `bg-teal-700 text-white` buttons.
      check('white on teal-700', [255, 255, 255], [d.accentRamp[700]])
    } else {
      for (const stop of [50, 100, 200, 300, 400])
        check(`slate-${stop}`, d.ramp[stop], [d.bg, d.surface])
      // `dark:bg-teal-400 dark:text-navy-950` buttons.
      check('navy-950 on teal-400', d.ramp[950], [d.accentRamp[400]])
    }
  }
})

test('the default lemon text on white is darkened until it is readable', () => {
  const light = resolveColors({ ...DEFAULT_STATE, mode: 'light' })
  const d = derive(light.bg, light.accent, 'light', light.accentLightSeed)
  // The owner's seed, rgb(202,160,0), is only 2.5:1 on white, so it moves darker.
  assert.ok(contrast([202, 160, 0], [255, 255, 255]) < 3)
  assert.ok(contrast(d.accentText, [255, 255, 255]) >= 4.5)
  assert.ok(d.accentText[0] <= 202 && d.accentText[1] <= 160)
})

test('saved choices round-trip through storage', () => {
  const storage = memoryStorage()
  const chosen = state({
    mode: 'light',
    bg: { dark: 'midnight', light: 'cream' },
    accent: 'purple',
  })
  saveState(storage, chosen)
  for (const key of Object.keys(storage.data)) assert.ok(key)
  for (const key of storage.data.keys()) {
    assert.match(key, /^agentlemon[.:]/)
  }
  assert.deepEqual(loadState(storage), chosen)
  // The pre-paint cache holds ready-to-apply variables.
  const cache = JSON.parse(storage.data.get(KEYS.cache)!)
  assert.equal(cache.mode, 'light')
  assert.equal(cache.dark, false)
  assert.equal(cache.tokens['--lm-accent'], '#6142ff')
})

test('invalid saved values fall back to the defaults', () => {
  const storage = memoryStorage({
    [KEYS.mode]: 'purple',
    [KEYS.bgDark]: 'chartreuse',
    [KEYS.accent]: '<script>',
    [KEYS.customAccent]: 'not-a-color',
  })
  assert.deepEqual(loadState(storage), DEFAULT_STATE)
})

test('a new visitor with nothing saved gets dark, black, and lemon', () => {
  assert.deepEqual(loadState(memoryStorage()), DEFAULT_STATE)
  assert.deepEqual(loadState(null), DEFAULT_STATE)
})

test('localStorage that throws never throws out of this module', () => {
  assert.deepEqual(loadState(throwingStorage), DEFAULT_STATE)
  assert.doesNotThrow(() => saveState(throwingStorage, DEFAULT_STATE))
  assert.doesNotThrow(() => saveState(null, DEFAULT_STATE))
})

test('reset returns to black and lemon', () => {
  assert.deepEqual(resetState(), DEFAULT_STATE)
  const { tokens } = tokensFor(resetState())
  assert.equal(tokens['--lm-bg'], '#0a0a0a')
  assert.equal(tokens['--lm-accent'], '#fad628')
})

test('the pre-paint defaults cover both modes', () => {
  const sets = defaultTokenSets()
  assert.equal(sets.dark.dark, true)
  assert.equal(sets.light.dark, false)
  assert.equal(sets.dark.tokens['--lm-bg'], '#0a0a0a')
  assert.equal(sets.light.tokens['--lm-bg'], '#ffffff')
  assert.equal(sets.light.tokens['--lm-accent'], '#fad628')
})

test('hex parsing accepts six digits and rejects the rest', () => {
  assert.deepEqual(parseHex('#fad628'), [250, 214, 40])
  assert.deepEqual(parseHex('FAD628'), [250, 214, 40])
  assert.equal(parseHex('#fff'), null)
  assert.equal(parseHex(42), null)
})
