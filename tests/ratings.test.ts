import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getBlockedWordsSync,
  noBlockedWordsClient,
  hasBlockedWord,
  HARD_CORE_BLOCKED_WORDS,
} from '../src/lib/blockedWords'
import { topRatedSort } from '../src/services/ratings'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('B-01: clean text passes blocked words check', () => {
  assert.equal(noBlockedWordsClient('hello world'), true)
  assert.equal(hasBlockedWord('hello world'), false)
  assert.equal(
    noBlockedWordsClient('This is a great agent with clean prompt!'),
    true,
  )
})

test('B-02: blocked word is rejected', () => {
  assert.equal(noBlockedWordsClient('this is bullshit'), false)
  assert.equal(hasBlockedWord('this is bullshit'), true)
  assert.equal(noBlockedWordsClient('what a retard here'), false)
  assert.equal(noBlockedWordsClient('shit test'), false)
})

test('B-03: blocked words are case-insensitive', () => {
  assert.equal(noBlockedWordsClient('BULLSHIT'), false)
  assert.equal(noBlockedWordsClient('ReTaRd'), false)
  assert.equal(noBlockedWordsClient('Shit'), false)
  assert.equal(hasBlockedWord('Porn'), true)
})

test('Whole-word boundaries accept innocent words containing blocked words', () => {
  // Innocent words that contain a blocked word as part of a longer word
  assert.equal(noBlockedWordsClient('Scunthorpe is a town in England'), true)
  assert.equal(noBlockedWordsClient('a fire retardant coating'), true)
  assert.equal(noBlockedWordsClient('I read Dickens and had a cocktail'), true)
  assert.equal(
    noBlockedWordsClient('shiitake mushrooms and a classic assessment'),
    true,
  )
  assert.equal(noBlockedWordsClient('spam and scam are not blocked'), true)

  // Explicit standalone blocked words must fail
  assert.equal(noBlockedWordsClient('a cocktail and a cock'), false)
  assert.equal(noBlockedWordsClient('retardant retard'), false)
  assert.equal(noBlockedWordsClient('porn'), false)
})

test('Hard-core blocked words list is non-empty and all match', () => {
  assert.ok(HARD_CORE_BLOCKED_WORDS.length >= 6)
  for (const word of HARD_CORE_BLOCKED_WORDS) {
    assert.equal(noBlockedWordsClient(`Check ${word} now`), false)
  }
})

test('B-04: topRatedSort orders by net score (thumbs_up - thumbs_down) descending', () => {
  const items = [
    { id: 'low', thumbs_up: 5, thumbs_down: 10 }, // net: -5
    { id: 'top', thumbs_up: 20, thumbs_down: 2 }, // net: 18
    { id: 'mid', thumbs_up: 10, thumbs_down: 1 }, // net: 9
  ]

  const sorted = [...items].sort(topRatedSort)
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['top', 'mid', 'low'],
  )
})

test('B-05: topRatedSort breaks ties with thumbs_up, then updated_at', () => {
  const items = [
    {
      id: 'fewer-votes',
      thumbs_up: 5,
      thumbs_down: 0,
      updated_at: '2026-01-01T00:00:00Z',
    }, // net: 5, up: 5
    {
      id: 'more-votes',
      thumbs_up: 10,
      thumbs_down: 5,
      updated_at: '2026-01-01T00:00:00Z',
    }, // net: 5, up: 10
    {
      id: 'older',
      thumbs_up: 5,
      thumbs_down: 0,
      updated_at: '2025-01-01T00:00:00Z',
    }, // net: 5, up: 5, older
  ]

  const sorted = [...items].sort(topRatedSort)
  // Tiebreaker 1: 'more-votes' has up: 10 vs up: 5
  // Tiebreaker 2: 'fewer-votes' (2026) is newer than 'older' (2025)
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['more-votes', 'fewer-votes', 'older'],
  )
})

test('topRatedSort falls back to stats.stars for agents', () => {
  const items = [
    {
      id: 'agent-1',
      stats: { stars: 15, updated_at: '2026-01-01T00:00:00Z' },
      thumbs_down: 0,
    },
    {
      id: 'agent-2',
      stats: { stars: 5, updated_at: '2026-01-01T00:00:00Z' },
      thumbs_down: 0,
    },
  ]
  const sorted = [...items].sort(topRatedSort)
  assert.deepEqual(
    sorted.map((i) => i.id),
    ['agent-1', 'agent-2'],
  )
})

test('the rules hard-core list is the first entries of blocked-words.json, and matches whole words only', () => {
  const rules = readFileSync(resolve(ROOT, 'firestore.rules'), 'utf8')
  const pattern = /function noBlockedWords[\s\S]*?\\\\b\(([^)]*)\)\\\\b/.exec(
    rules,
  )
  assert.ok(pattern, 'noBlockedWords has a whole-word alternation')
  const inRules = pattern[1].split('|')
  assert.deepEqual(inRules, [...HARD_CORE_BLOCKED_WORDS])
  assert.deepEqual(
    getBlockedWordsSync().slice(0, inRules.length),
    inRules,
    'the rules list is the front of the full list',
  )
  // Case-insensitive in the rules too.
  assert.match(pattern[0], /\(\?is\)/)
})

test('stars cannot be created from any client code, and comments need a username', () => {
  const root = resolve(ROOT, 'src')
  const sources: string[] = []
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) sources.push(path)
    }
  }
  walk(root)
  for (const path of sources) {
    const text = readFileSync(path, 'utf8')
    assert.doesNotMatch(text, /toggleStar/, `${path} still toggles stars`)
  }
  const comments = readFileSync(
    resolve(ROOT, 'src/components/ratings/CommentsSection.tsx'),
    'utf8',
  )
  assert.match(comments, /Choose a username before commenting/)
  // No made-up fallback handle: the profile's handle is the only one used.
  assert.doesNotMatch(comments, /'anonymous'/)
})
