import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACADEMY_DONE_KEY,
  readAcademyDone,
  writeAcademyDone,
} from '../src/lib/academyProgress'

test('Academy progress reads and writes a JSON list in browser storage', () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  })

  writeAcademyDone(['connect', 'make-agent'])
  assert.equal(values.get(ACADEMY_DONE_KEY), '["connect","make-agent"]')
  assert.deepEqual(readAcademyDone(), ['connect', 'make-agent'])
})

test('Academy progress safely handles invalid and unavailable browser storage', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => '{not json',
        setItem: () => {
          throw new Error('storage is disabled')
        },
      },
    },
  })

  assert.deepEqual(readAcademyDone(), [])
  assert.doesNotThrow(() => writeAcademyDone(['connect']))

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    get() {
      throw new Error('window is unavailable')
    },
  })
  assert.deepEqual(readAcademyDone(), [])
  assert.doesNotThrow(() => writeAcademyDone([]))
})
