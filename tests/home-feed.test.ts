import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { trendingFrom, trendingItems, type HomeItem } from '../src/lib/homeFeed'
import type { AgentManifest } from '../src/types/agent'
import type { CouncilIndexEntry } from '../src/types/council'
import type { SkillIndexEntry } from '../src/types/skill'
import { skill } from './skillFixture'

const author = { uid: 'u1', name: 'Ada', handle: 'ada', verified: false }

function agent(id: string, stars: number, updated: string): AgentManifest {
  return {
    ...SEED_AGENTS[0],
    id,
    name: id,
    stats: { stars, views: 0, updated_at: updated },
  }
}

function skillEntry(
  id: string,
  thumbs: number | undefined,
  updated: string,
): SkillIndexEntry {
  const { files, ...rest } = skill({
    id,
    name: id,
    stats: { updated_at: updated, thumbs_up: thumbs },
  })
  return {
    ...rest,
    files: files.map(({ path, kind, content }) => ({
      path,
      kind,
      bytes: content.length,
    })),
  }
}

function council(id: string, updated: string): CouncilIndexEntry {
  return {
    council_schema_version: 1,
    visibility: 'public',
    id,
    version: '1.0.0',
    name: id,
    description: 'A team.',
    author,
    tags: ['writing'],
    members: [],
    stats: { updated_at: updated },
    instructions_bytes: 10,
    member_count: 3,
  }
}

const names = (items: HomeItem[]) => items.map((item) => item.name)

test('trending ranks agents, skills, and councils together by thumbs up', () => {
  const items = trendingFrom({
    agents: [
      agent('a-low', 1, '2026-11-01T00:00:00Z'),
      agent('a-top', 9, '2026-11-01T00:00:00Z'),
    ],
    skills: [skillEntry('s-mid', 5, '2026-11-01T00:00:00Z')],
    councils: [council('c-new', '2026-11-20T00:00:00Z')],
  })
  assert.deepEqual(names(items), ['a-top', 's-mid', 'a-low', 'c-new'])
  assert.equal(items.find((i) => i.kind === 'council')?.likes, 0)
})

test('ties go to the newest, and trending stops at six', () => {
  const items = trendingFrom({
    agents: ['a', 'b', 'c', 'd'].map((id, i) =>
      agent(id, 2, `2026-11-0${i + 1}T00:00:00Z`),
    ),
    skills: [skillEntry('s-old', undefined, '2026-10-01T00:00:00Z')],
    councils: [
      council('c-1', '2026-11-10T00:00:00Z'),
      council('c-2', '2026-11-05T00:00:00Z'),
    ],
  })
  assert.equal(items.length, 6)
  // Four agents with 2 each come first, newest first; then the councils (0, newer
  // than the skill) and the skill is cut.
  assert.deepEqual(names(items), ['d', 'c', 'b', 'a', 'c-1', 'c-2'])
})

test('fewer than six items shows what there is, and nothing gives nothing', () => {
  assert.equal(
    trendingFrom({
      agents: [agent('only', 0, '2026-11-01T00:00:00Z')],
      skills: [],
      councils: [],
    }).length,
    1,
  )
  assert.deepEqual(trendingFrom({ agents: [], skills: [], councils: [] }), [])
  assert.deepEqual(trendingItems([]), [])
})

test('a bad date or a missing count never breaks the order', () => {
  const items = trendingFrom({
    agents: [agent('a', 1, 'not a date')],
    skills: [skillEntry('s', undefined, '2026-11-01T00:00:00Z')],
    councils: [],
  })
  assert.deepEqual(names(items), ['a', 's'])
})

test('cards link to the item', () => {
  const [a] = trendingFrom({
    agents: [agent('x y', 0, '2026-11-01T00:00:00Z')],
    skills: [],
    councils: [],
  })
  assert.equal(a.to, '/agents?agent=x%20y')
  const items = trendingFrom({
    agents: [],
    skills: [skillEntry('pdf-forms', 1, '2026-11-01T00:00:00Z')],
    councils: [council('review-team', '2026-11-01T00:00:00Z')],
  })
  assert.deepEqual(
    items.map((i) => i.to),
    ['/skills/pdf-forms', '/councils/review-team'],
  )
})
