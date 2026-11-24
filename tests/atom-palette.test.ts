import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCENTS,
  DARK_BACKGROUNDS,
  DEFAULT_STATE,
  LIGHT_BACKGROUNDS,
  contrast,
  isDarkColor,
  tokensFor,
  type Mode,
} from '../src/theme/appearance'
import { LIGHT_MODE_STAGE, atomPalette } from '../src/theme/atomPalette'

function palette(mode: Mode, bg: string, accent: string) {
  return atomPalette(
    tokensFor({
      ...DEFAULT_STATE,
      mode,
      bg: { ...DEFAULT_STATE.bg, [mode]: bg },
      accent,
    }).tokens,
  )
}

const apart = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// The atom is drawn on a dark stage in both modes (the page in dark mode, its
// own panel in light mode), so colors are checked against the stage. There is
// no text painted on the nucleus any more, so the old label check is gone.
test('every background and accent keeps the electrons visible and distinct', () => {
  const modes: [Mode, readonly { id: string }[]][] = [
    ['dark', DARK_BACKGROUNDS],
    ['light', LIGHT_BACKGROUNDS],
  ]
  for (const [mode, backgrounds] of modes) {
    for (const bg of backgrounds) {
      for (const accent of ACCENTS) {
        const p = palette(mode, bg.id, accent.id)
        const where = `${mode}/${bg.id}/${accent.id}`
        assert.ok(isDarkColor(p.stage), `stage is dark on ${where}`)
        if (mode === 'light') assert.deepEqual(p.stage, LIGHT_MODE_STAGE)
        else assert.deepEqual(p.stage, p.bg)
        assert.ok(contrast(p.agent, p.stage) >= 3, `agents on ${where}`)
        assert.ok(contrast(p.skill, p.stage) >= 3, `skills on ${where}`)
        assert.ok(contrast(p.ringCool, p.stage) >= 3, `cool rings on ${where}`)
        assert.ok(contrast(p.ringWarm, p.stage) >= 3, `warm rings on ${where}`)
        assert.ok(contrast(p.accent, p.stage) >= 3, `nucleus on ${where}`)
        assert.ok(apart(p.agent, p.skill) >= 100, `agent vs skill on ${where}`)
        assert.ok(
          apart(p.agent, p.accent) >= 100,
          `agent vs nucleus on ${where}`,
        )
        assert.ok(
          apart(p.nucleons[0], p.nucleons[1]) >= 40 &&
            apart(p.nucleons[1], p.nucleons[2]) >= 40,
          `nucleon tones differ on ${where}`,
        )
      }
    }
  }
})

test('a custom gray accent still gets a colored agent hue', () => {
  const p = atomPalette(
    tokensFor({ ...DEFAULT_STATE, accent: 'custom', customAccent: '#808080' })
      .tokens,
  )
  assert.ok(contrast(p.agent, p.stage) >= 3)
  assert.ok(Math.max(...p.agent) - Math.min(...p.agent) > 60)
})

test('lemon on black: a warm nucleus with an azure agent hue', () => {
  const p = palette('dark', 'black', 'lemon')
  const [r, g, b] = p.agent
  assert.ok(b > r && b > g, `agent is blue-dominant: ${p.agent.join(',')}`)
  assert.ok(p.nucleons[1][0] > p.nucleons[1][2], 'deeper tone stays warm')
})
