import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) =>
  readFileSync(resolve(import.meta.dirname, '..', file), 'utf8')

test('production never points at the local emulators', () => {
  assert.doesNotMatch(read('.env.production'), /VITE_FIREBASE_EMULATOR/)
  assert.match(read('.env.emulator'), /^VITE_FIREBASE_EMULATOR=1$/m)
  assert.match(read('.env.emulator'), /^VITE_FIREBASE_PROJECT_ID=demo-/m)
})
