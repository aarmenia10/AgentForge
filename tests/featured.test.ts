import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeaturedSection } from '../src/components/home/FeaturedSection'
import {
  currentFeaturedWeek,
  loadFeatured,
  type FeaturedFeed,
} from '../src/lib/featured'

const now = new Date('2026-11-23T20:00:00Z')
const item: FeaturedFeed['items'][number] = {
  kind: 'agent',
  id: 'story-continuity-editor',
  version: '1.0.0',
  name: 'Story Continuity Editor',
  description: 'Track details across drafts.',
  author_handle: 'agentforge',
  note: 'Start here.',
}
const signal = new AbortController().signal

async function renderFeatured() {
  const featured = await loadFeatured(signal, now)
  return renderToStaticMarkup(createElement(FeaturedSection, { featured }))
}

test('featured weeks start on Monday in UTC', () => {
  assert.equal(currentFeaturedWeek(now), '2026-11-23')
  assert.equal(
    currentFeaturedWeek(new Date('2026-11-22T23:59:59Z')),
    '2026-11-16',
  )
  assert.equal(
    currentFeaturedWeek(new Date('2027-01-01T00:00:00Z')),
    '2026-12-28',
  )
})

test('the home view hides empty and stale featured feeds, including a dated empty list', async (t) => {
  for (const feed of [
    { week_of: null, items: [] },
    { week_of: '2026-11-23', items: [] },
    { week_of: '2026-11-02', items: [item] },
  ]) {
    await t.test(JSON.stringify(feed.week_of), async (subtest) => {
      const request = subtest.mock.method(globalThis, 'fetch', async () =>
        Response.json(feed),
      )
      assert.equal(await renderFeatured(), '')
      assert.deepEqual(request.mock.calls[0].arguments, [
        '/featured.json',
        { signal },
      ])
    })
  }
})

test('the home view hides featured picks when the fetch fails', async (t) => {
  for (const [name, response] of [
    ['network error', () => Promise.reject(new Error('Offline'))],
    ['HTTP error', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['invalid JSON', () => Promise.resolve(new Response('<html>'))],
  ] as const) {
    await t.test(name, async (subtest) => {
      subtest.mock.method(globalThis, 'fetch', response)
      assert.equal(await renderFeatured(), '')
    })
  }
})

test('the home view keeps the saved order and notes through the 14-day cutoff', async (t) => {
  const feed: FeaturedFeed = {
    week_of: '2026-11-09',
    items: [{ ...item, kind: 'skill', id: 'public-skill' }, item],
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json(feed))
  assert.deepEqual(await loadFeatured(signal, now), feed)
  assert.equal(
    await loadFeatured(signal, new Date('2026-11-24T00:00:00Z')),
    null,
  )
})
