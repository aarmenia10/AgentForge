import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildCouncilReplacementInput,
  findCouncilsPinningItem,
} from '../src/services/councilStore'
import type { CouncilRecord } from '../src/types/council'
import { SEED_AGENTS } from '../src/data/seedAgents'
import type { ItemRef } from '../src/types/skill'

const source: ItemRef = {
  kind: 'agent',
  id: 'researcher',
  version: '1.0.0',
}
const newerSource: ItemRef = { ...source, version: '1.1.0' }
const replacement: ItemRef = {
  kind: 'agent',
  id: 'editor',
  version: '2.3.0',
}

function council(members: CouncilRecord['members']): CouncilRecord {
  return {
    council_schema_version: 1,
    id: 'research-team',
    version: '1.0.0',
    visibility: 'private',
    author: SEED_AGENTS[0].author,
    owner_uid: 'owner',
    review_status: 'pending',
    name: 'Research team',
    description: 'A team for research.',
    tags: ['research'],
    instructions: 'Gather sources, then review the findings.',
    members,
    stats: { updated_at: '2026-01-01T00:00:00.000Z' },
  }
}

test('finds every matching version, or only the requested pinned version', () => {
  const first = council([
    { ref: source, role: 'Find sources', order: 1 },
    { ref: newerSource, role: 'Check sources', order: 2 },
  ])
  const second = {
    ...first,
    id: 'other-team',
    name: 'Other team',
    members: [{ ref: source, role: 'Summarize', order: 1 }],
  }

  assert.deepEqual(
    findCouncilsPinningItem([first, second], source).map(
      ({ council: found }) => found.id,
    ),
    ['research-team', 'other-team'],
  )
  assert.deepEqual(
    findCouncilsPinningItem([first, second], source, '1.0.0').map(
      ({ members }) => members.map(({ ref }) => ref.version),
    ),
    [['1.0.0'], ['1.0.0']],
  )
})

test('builds a replacement council input with exact pin and original role/order', () => {
  const original = council([
    { ref: source, role: 'Find sources', order: 1 },
    { ref: newerSource, role: 'Check sources', order: 2 },
    {
      ref: { kind: 'skill', id: 'summarizer', version: '3.0.0' },
      role: 'Summarize',
      order: 2,
    },
  ])

  const input = buildCouncilReplacementInput(
    original,
    source,
    replacement,
    source.version,
  )

  assert.deepEqual(
    input.members.map(({ ref, role, order }) => ({ ref, role, order })),
    [
      { ref: replacement, role: 'Find sources', order: 1 },
      { ref: newerSource, role: 'Check sources', order: 2 },
      {
        ref: { kind: 'skill', id: 'summarizer', version: '3.0.0' },
        role: 'Summarize',
        order: 2,
      },
    ],
  )
})
