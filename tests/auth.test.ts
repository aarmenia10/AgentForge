import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAuthService } from '../src/lib/auth'
import type { AuthRuntime, AuthUser } from '../src/lib/auth'

const user: AuthUser = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  avatarUrl: null,
  emailVerified: false,
}
function fakeRuntime() {
  const calls: unknown[][] = []
  let changed: (user: AuthUser | null) => void = () => {}
  const runtime: AuthRuntime = {
    async signInWithGoogle() {
      calls.push(['google'])
      return user
    },
    async signInWithEmail(...args) {
      calls.push(['email', ...args])
      return user
    },
    async signUpWithEmail(...args) {
      calls.push(['signup', ...args])
      return user
    },
    async sendPasswordReset(...args) {
      calls.push(['reset', ...args])
    },
    async signOut() {
      calls.push(['out'])
      changed(null)
    },
    onAuthChange(listener) {
      changed = listener
      return () => {}
    },
    async refreshUser() {
      return { ...user, emailVerified: true }
    },
  }
  return {
    runtime,
    calls,
    change(value: AuthUser | null) {
      changed(value)
    },
  }
}

test('signed-out observation and unsubscribe do not load Firebase', async () => {
  let loads = 0
  const fake = fakeRuntime()
  const { service } = createAuthService(async () => {
    loads++
    return fake.runtime
  }, false)
  const seen: (AuthUser | null)[] = []
  const stop = service.onAuthChange((value) => seen.push(value))
  assert.deepEqual(seen, [null])
  await service.signOut()
  assert.equal(loads, 0)
  stop()
  await service.signInWithGoogle()
  assert.equal(loads, 1)
  assert.deepEqual(seen, [null, null])
})

test('all methods forward arguments, share initialization, and expose refreshed verification', async () => {
  const fake = fakeRuntime()
  let loads = 0
  const { service, refreshUser } = createAuthService(async () => {
    loads++
    return fake.runtime
  }, false)
  const seen: (AuthUser | null)[] = []
  service.onAuthChange((value) => seen.push(value))
  await Promise.all([
    service.signInWithGoogle(),
    service.signInWithEmail('a@b.com', 'password'),
  ])
  assert.equal(loads, 1)
  assert.equal(
    (await service.signUpWithEmail('c@d.com', 'secret', 'Alice')).emailVerified,
    false,
  )
  await service.sendPasswordReset('c@d.com')
  assert.equal((await refreshUser())?.emailVerified, true)
  assert.equal(seen.at(-1)?.emailVerified, true)
  fake.change(null)
  assert.equal(seen.at(-1), null)
  await service.signOut()
  assert.deepEqual(fake.calls, [
    ['google'],
    ['email', 'a@b.com', 'password'],
    ['signup', 'c@d.com', 'secret', 'Alice'],
    ['reset', 'c@d.com'],
    ['out'],
  ])
})

test('remembered sessions restore lazily on observation; failed initialization can retry', async () => {
  const fake = fakeRuntime()
  let loads = 0
  const { service } = createAuthService(async () => {
    if (++loads === 1) throw new Error('offline')
    return fake.runtime
  }, true)
  assert.equal(loads, 0)
  await assert.rejects(service.signInWithGoogle(), /offline/)
  const seen: (AuthUser | null)[] = []
  const stop = service.onAuthChange((value) => seen.push(value))
  await service.signInWithGoogle()
  assert.equal(loads, 2)
  assert.equal(seen.at(-1)?.uid, 'alice')
  stop()
  fake.change(null)
  assert.equal(seen.at(-1)?.uid, 'alice')
})
