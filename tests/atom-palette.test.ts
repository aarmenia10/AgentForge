import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCENTS,
  DARK_BACKGROUNDS,
  DEFAULT_STATE,
  LIGHT_BACKGROUNDS,
  contrast,
  tokensFor,
  type Mode,
} from '../src/theme/appearance'
import { atomPalette } from '../src/theme/atomPalette'

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
        assert.ok(contrast(p.agent, p.bg) >= 3, `agents on ${where}`)
        assert.ok(contrast(p.skill, p.bg) >= 3, `skills on ${where}`)
        assert.ok(contrast(p.ring, p.bg) >= 1.5, `rings on ${where}`)
        assert.ok(contrast(p.accentInk, p.accent) >= 4.5, `label on ${where}`)
        const apart = (a: readonly number[], b: readonly number[]) =>
          Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        assert.ok(apart(p.agent, p.skill) >= 100, `agent vs skill on ${where}`)
        assert.ok(
          apart(p.agent, p.accent) >= 100,
          `agent vs nucleus on ${where}`,
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
  assert.ok(contrast(p.agent, p.bg) >= 3)
  assert.ok(Math.max(...p.agent) - Math.min(...p.agent) > 60)
})
