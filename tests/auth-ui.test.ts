import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describeAuthError, isUserCancellation } from '../src/auth/authErrors'

const ROOT = resolve(import.meta.dirname, '..')

test('known Firebase auth codes map to plain messages', () => {
  const err = (code: string) =>
    Object.assign(new Error('raw sdk text'), { code })
  assert.equal(
    describeAuthError(err('auth/invalid-credential'), 'sign-in'),
    'That email and password do not match an account.',
  )
  assert.match(
    describeAuthError(err('auth/email-already-in-use'), 'sign-up'),
    /already uses/,
  )
  assert.match(
    describeAuthError(err('auth/weak-password'), 'sign-up'),
    /at least 6/,
  )
  assert.match(
    describeAuthError(err('auth/operation-not-allowed'), 'google'),
    /not switched on/,
  )
})

test('unknown errors never leak SDK text', () => {
  const message = describeAuthError(
    new Error('Firebase: internal (auth/xyz).'),
    'reset',
  )
  assert.equal(message, 'Could not send the reset email. Try again.')
  assert.doesNotMatch(describeAuthError('boom', 'sign-in'), /boom/)
})

test('closing the Google window is not treated as an error', () => {
  assert.equal(isUserCancellation({ code: 'auth/popup-closed-by-user' }), true)
  assert.equal(isUserCancellation({ code: 'auth/invalid-credential' }), false)
})

/**
 * README 7.2: no Firebase code may load for a signed-out visitor who never
 * opens the sign-in dialog. Walk every static import reachable from the entry
 * and fail if any of them is a Firebase package. Dynamic `import()` and
 * `import type` are allowed; they do not load at startup.
 */
/** Every file reachable from `src/main.tsx` by static import, and any Firebase imports. */
function walkStartupGraph() {
  const seen = new Set<string>()
  const offenders: string[] = []
  const staticImport =
    /^\s*import\s+(?!type\b)(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm

  function resolveLocal(spec: string, from: string): string | null {
    const base = spec.startsWith('@/')
      ? join(ROOT, 'src', spec.slice(2))
      : resolve(dirname(from), spec)
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
    ]) {
      if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate
    }
    return null
  }

  function visit(file: string) {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const [, spec] of source.matchAll(staticImport)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const next = resolveLocal(spec, file)
        if (next) visit(next)
      } else if (
        spec === 'firebase' ||
        spec.startsWith('firebase/') ||
        spec.startsWith('@firebase/')
      ) {
        offenders.push(`${file.slice(ROOT.length + 1)} imports ${spec}`)
      }
    }
  }

  visit(join(ROOT, 'src', 'main.tsx'))
  return { seen, offenders }
}

test('the startup import graph contains no Firebase module', () => {
  const { seen, offenders } = walkStartupGraph()
  assert.ok(
    seen.has(join(ROOT, 'src', 'auth', 'AuthProvider.tsx')),
    'walker reached AuthProvider',
  )
  assert.deepEqual(offenders, [])
})

/**
 * P2-11: every page except the home page is a React.lazy chunk, so no
 * signed-in page, and not the account gate, ships in the startup bundle.
 */
test('no signed-in page module is statically reachable from the entry', () => {
  const { seen } = walkStartupGraph()
  const rel = [...seen].map((file) => file.slice(ROOT.length + 1))
  assert.ok(rel.includes('src/pages/HomePage.tsx'), 'walker reached HomePage')
  assert.ok(rel.includes('src/router/Router.tsx'), 'walker reached the router')
  const pages = rel.filter(
    (file) =>
      file.startsWith('src/pages/') && file !== 'src/pages/HomePage.tsx',
  )
  assert.deepEqual(pages, [])
  for (const gated of [
    'src/components/RequireAccount.tsx',
    'src/services/agents.ts',
  ]) {
    assert.ok(!rel.includes(gated), `${gated} is in the startup graph`)
  }
})
