import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  noBlockedWordsClient,
  hasBlockedWord,
  HARD_CORE_BLOCKED_WORDS,
} from '../src/lib/blockedWords'
import { topRatedSort } from '../src/services/ratings'

test('B-01: clean text passes blocked words check', () => {
  assert.equal(noBlockedWordsClient('hello world'), true)
  assert.equal(hasBlockedWord('hello world'), false)
  assert.equal(
    noBlockedWordsClient('This is a great agent with clean prompt!'),
    true,
  )
})

test('B-02: blocked word is rejected', () => {
  assert.equal(noBlockedWordsClient('buy now word1'), false)
  assert.equal(hasBlockedWord('buy now word1'), true)
  assert.equal(noBlockedWordsClient('this is a badword here'), false)
  assert.equal(noBlockedWordsClient('spamword test'), false)
})

test('B-03: blocked words are case-insensitive', () => {
  assert.equal(noBlockedWordsClient('WORD1'), false)
  assert.equal(noBlockedWordsClient('BadWord'), false)
  assert.equal(noBlockedWordsClient('SPAM'), false)
  assert.equal(hasBlockedWord('Word1'), true)
})

test('Whole-word boundaries accept innocent words containing blocked words', () => {
  // Innocent words that contain "word1" or "badword" or "spam" or "scam" as substrings
  assert.equal(noBlockedWordsClient('sword1 is a cool weapon'), true)
  assert.equal(noBlockedWordsClient('my password1 is secure'), true)
  assert.equal(noBlockedWordsClient('word1ing is not a word'), true)
  assert.equal(noBlockedWordsClient('crossbadwords are interesting'), true)
  assert.equal(noBlockedWordsClient('the spammer sent emails'), true)
  assert.equal(noBlockedWordsClient('he was scammed by someone'), true)

  // Explicit standalone blocked words must fail
  assert.equal(noBlockedWordsClient('sword1 word1'), false)
  assert.equal(noBlockedWordsClient('password1 badword'), false)
  assert.equal(noBlockedWordsClient('word1'), false)
  assert.equal(noBlockedWordsClient('badword'), false)
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
