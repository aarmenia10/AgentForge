import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { authorProfile } from '../src/components/profile/authorProfile'
import {
  describeProfileError,
  displayNameProblem,
  handleFormatProblem,
  HANDLE_RULE,
  PUBLISHED_HANDLE_NOTE,
} from '../src/components/profile/handleRules'
import {
  needsWelcomeCheck,
  readProfileMemory,
  rememberProfile,
  rememberWelcomed,
} from '../src/components/profile/profileMemory'
import { InstallPanel } from '../src/components/detail/InstallPanel'
import type { AgentManifest } from '../src/types/agent'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  }
}

test('username format problems are explained in plain words', () => {
  assert.equal(handleFormatProblem('ada-l'), null)
  assert.equal(handleFormatProblem('a1b'), null)
  assert.match(handleFormatProblem('') ?? '', /Choose/)
  assert.match(handleFormatProblem('Ada') ?? '', /lowercase/)
  assert.match(handleFormatProblem('ab') ?? '', /at least 3/)
  assert.match(handleFormatProblem('a'.repeat(31)) ?? '', /at most 30/)
  assert.match(
    handleFormatProblem('ada_l') ?? '',
    /letters, digits, and hyphens/,
  )
  assert.match(handleFormatProblem('-ada') ?? '', /Start and end/)
  assert.match(handleFormatProblem('ada-') ?? '', /Start and end/)
  for (const reserved of ['agentforge', 'agentlemon', 'admin', 'support'])
    assert.match(handleFormatProblem(reserved) ?? '', /reserved/)
  assert.match(HANDLE_RULE, /3 to 30 lowercase letters, digits, or hyphens/)
})

test('the published-username rule says agents keep their approved username', () => {
  assert.match(PUBLISHED_HANDLE_NOTE, /already published keep the username/)
  assert.match(PUBLISHED_HANDLE_NOTE, /until you publish an update/)
})

test('display names need visible text and at most 100 characters', () => {
  assert.equal(displayNameProblem('Ada'), null)
  assert.ok(displayNameProblem('   '))
  assert.ok(displayNameProblem('x'.repeat(101)))
})

test('profile errors never show SDK text', () => {
  assert.match(describeProfileError(new Error('Handle is taken')), /just took/)
  assert.match(
    describeProfileError(new Error('Profile already exists')),
    /already have a profile/,
  )
  assert.match(
    describeProfileError({ code: 'permission-denied', message: 'raw' }),
    /refused/,
  )
  assert.doesNotMatch(
    describeProfileError(new Error('FirebaseError: internal stuff')),
    /Firebase|internal/,
  )
})

test('the public profile is built from the catalog alone', () => {
  const seedHandle = SEED_AGENTS[0].author.handle
  const profile = authorProfile(SEED_AGENTS, seedHandle)
  assert.ok(profile.agents.length > 0)
  assert.ok(profile.agents.every((a) => a.author.handle === seedHandle))
  assert.equal(profile.displayName, SEED_AGENTS[0].author.name)
  assert.equal(profile.uid, SEED_AGENTS[0].author.uid)
  for (let i = 1; i < profile.agents.length; i++)
    assert.ok(
      profile.agents[i - 1].stats.updated_at >=
        profile.agents[i].stats.updated_at,
    )
  const nobody = authorProfile(SEED_AGENTS, 'nobody-here')
  assert.deepEqual(nobody.agents, [])
  assert.equal(nobody.displayName, null)
  assert.equal(nobody.uid, null)
  assert.equal(nobody.verified, false)
})

test('Verified author on the profile follows author.verified', () => {
  const base = SEED_AGENTS[0]
  const make = (id: string, verified: boolean): AgentManifest => ({
    ...base,
    id,
    author: { ...base.author, handle: 'pat', verified },
  })
  assert.equal(authorProfile([make('a', false)], 'pat').verified, false)
  assert.equal(
    authorProfile([make('a', false), make('b', true)], 'pat').verified,
    true,
  )
})

test('profile memory: a known profile or a shown welcome skips the check', () => {
  const previous = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage(),
    configurable: true,
  })
  try {
    assert.equal(readProfileMemory('u1'), null)
    assert.equal(needsWelcomeCheck('u1'), true)
    rememberWelcomed('u1')
    assert.deepEqual(readProfileMemory('u1'), { handle: null, welcomed: true })
    assert.equal(needsWelcomeCheck('u1'), false)
    rememberProfile('u2', 'pat')
    assert.deepEqual(readProfileMemory('u2'), { handle: 'pat', welcomed: true })
    assert.equal(needsWelcomeCheck('u2'), false)
    rememberWelcomed('u2')
    assert.equal(readProfileMemory('u2')?.handle, 'pat')
    // Per user: another account in the same browser is still checked once.
    assert.equal(needsWelcomeCheck('u3'), true)
    globalThis.localStorage.setItem('agentlemon.profile.u4', '{not json')
    assert.equal(readProfileMemory('u4'), null)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      value: previous,
      configurable: true,
    })
  }
})

test('profile memory survives blocked storage', () => {
  const previous = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    get() {
      throw new Error('blocked')
    },
    configurable: true,
  })
  try {
    assert.equal(readProfileMemory('u1'), null)
    assert.doesNotThrow(() => rememberProfile('u1', 'pat'))
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      value: previous,
      configurable: true,
    })
  }
})

test('the install tab warns about an unverified author and says nothing extra for a Verified author', () => {
  const base = SEED_AGENTS[0]
  const unverified = renderToStaticMarkup(
    createElement(InstallPanel, {
      agent: {
        ...base,
        author: { ...base.author, handle: 'pat', verified: false },
      },
    }),
  )
  assert.match(unverified, /has not confirmed who @pat is/)
  assert.match(unverified, /Read\s+the agent instructions/)
  const verified = renderToStaticMarkup(
    createElement(InstallPanel, {
      agent: { ...base, author: { ...base.author, verified: true } },
    }),
  )
  assert.doesNotMatch(verified, /not confirmed|has not confirmed/)
  assert.doesNotMatch(verified, /safety|reviewed|safe to use/i)
  // The connector card stays at the top of the install tab.
  assert.match(verified, /MCP Connector \(AI Connection\)/)
})
