import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { AGENT_CATEGORIES, AGENT_FRAMEWORKS } from '../src/types/agent'
import {
  validateCatalog,
  validateManifest,
  validateAgentRecord,
  createSchemaValidator,
} from '../src/lib/validateManifest'
import { queryAgents, DEFAULT_QUERY } from '../src/lib/catalog'
import type { AgentRecord } from '../src/types/agent'
import { mergeCatalog } from '../scripts/export-catalog'
import { createFirestoreAgentRepository } from '../src/lib/agentRepository'

test('curated seeds cover every category and framework and satisfy the strict contract', async () => {
  const agents = validateCatalog([...SEED_AGENTS])
  assert.equal(new Set(agents.map((a) => a.id)).size, agents.length)
  for (const { tag } of AGENT_CATEGORIES) {
    assert.ok(agents.filter((a) => a.tags.includes(tag)).length >= 2, tag)
  }
  for (const framework of AGENT_FRAMEWORKS) {
    assert.ok(agents.some((a) => a.framework === framework), framework)
  }
  assert.deepEqual(
    validateCatalog(JSON.parse(await readFile('public/catalog.json', 'utf8'))),
    mergeCatalog(SEED_AGENTS, []),
  )
  for (const a of agents) {
    assert.ok(a.prompt_blueprint.instructions.length >= 5)
    assert.ok(a.prompt_blueprint.verification_rules.length >= 5)
    assert.equal(createSchemaValidator().compile(a.input_schema)({}), false)
    assert.equal(createSchemaValidator().compile(a.output_schema)({}), false)
  }
})

test('rejects malformed manifests, nested extras, versions, dates, counters, and schemas', () => {
  const base = SEED_AGENTS[0]
  for (const patch of [
    { unexpected: true },
    { version: '1.0' },
    { version: '1.0.0-01' },
    { id: '../bad' },
    { author: { ...base.author, extra: true } },
    { framework: 'unsupported' },
    { stats: { ...base.stats, stars: -1 } },
    { stats: { ...base.stats, views: 1.5 } },
    { stats: { ...base.stats, updated_at: 'yesterday' } },
    { prompt_blueprint: { ...base.prompt_blueprint, instructions: [] } },
    { input_schema: { type: 'not-a-type' } },
    { output_schema: { $ref: 'https://missing.invalid/schema' } },
  ])
    assert.throws(() => validateManifest({ ...base, ...patch }))
  assert.throws(() => validateCatalog({ agents: [] }))
  assert.throws(() => validateCatalog([base, base]))
})

test('live records override seeds; approval and privacy changes suppress seeds; invalid live records fail', () => {
  const base = SEED_AGENTS[0]
  const live: AgentRecord = { ...base, version: '1.1.0', stats: { ...base.stats, stars: 5 }, owner_uid: 'owner', review_status: 'approved', shared_with: [] }
  assert.equal(
    mergeCatalog(SEED_AGENTS, [live]).find((a) => a.id === base.id)?.stats
      .stars,
    5,
  )
  assert.equal(
    mergeCatalog(SEED_AGENTS, [
      { ...live, review_status: 'rejected' },
    ]).length,
    SEED_AGENTS.length - 1,
  )
  assert.throws(() => mergeCatalog(SEED_AGENTS, [{ ...live, bogus: 1 }]))
})

test('repository uses only /catalog.json and preserves last valid memory snapshot offline', async () => {
  const remote = [{ ...SEED_AGENTS[0], name: 'Remote catalog agent' }]
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/catalog.json')
    return new Response(JSON.stringify(remote))
  })
  try {
    const repository = createFirestoreAgentRepository()
    const [one, two] = await Promise.all([
      repository.listAgents(),
      repository.listAgents(),
    ])
    assert.equal(fetchMock.mock.callCount(), 1)
    assert.deepEqual(one, remote)
    one[0].name = 'mutated by consumer'
    assert.equal(two[0].name, 'Remote catalog agent')
    fetchMock.mock.mockImplementation(async () => {
      throw new Error('offline')
    })
    assert.deepEqual(await repository.listAgents(), remote)
    assert.equal(
      (await repository.getAgent(remote[0].id))?.name,
      remote[0].name,
    )
    assert.equal(await repository.getAgent('missing'), null)
    const offline = createFirestoreAgentRepository()
    assert.equal((await offline.listAgents()).length, SEED_AGENTS.length)
    fetchMock.mock.mockImplementation(
      async () => new Response('<html>SPA fallback</html>'),
    )
    assert.equal((await offline.listAgents()).length, SEED_AGENTS.length)
    fetchMock.mock.mockImplementation(
      async () => new Response('error', { status: 503 }),
    )
    assert.equal((await offline.listAgents()).length, SEED_AGENTS.length)
  } finally {
    fetchMock.mock.restore()
  }
})

test('version 2 requires identity, visibility, and the schema discriminator; handles follow the contract', () => {
  const base = SEED_AGENTS[0]
  for (const handle of ['abc', 'a-b', '123', 'a--b', 'a'.repeat(30)]) {
    assert.equal(validateManifest({ ...base, author: { ...base.author, handle } }).author.handle, handle)
  }
  for (const handle of ['', 'ab', '-abc', 'abc-', 'Abc', 'a_b', 'a b', '@abc', 'ébc', 'a'.repeat(31), 'abc\n']) {
    assert.throws(() => validateManifest({ ...base, author: { ...base.author, handle } }), handle)
  }
  for (const patch of [
    { schema_version: undefined }, { schema_version: 1 }, { schema_version: '2' },
    { visibility: undefined }, { visibility: 'unlisted' },
    { author: { ...base.author, uid: undefined } }, { author: { ...base.author, uid: ' ' } },
    { author: { ...base.author, handle: undefined } },
    { author: { name: 'Legacy', github: 'legacy', verified: true } },
    { owner_uid: 'owner' }, { review_status: 'approved' }, { shared_with: [] },
  ]) assert.throws(() => validateManifest({ ...base, ...patch }))
  for (const visibility of ['private', 'friends'] as const) {
    assert.equal(validateManifest({ ...base, visibility }).visibility, visibility)
    assert.throws(() => validateCatalog([{ ...base, visibility }]))
  }
})

test('only approved public records enter catalog.json; storage metadata never leaks', () => {
  const base: AgentRecord = { ...SEED_AGENTS[0], owner_uid: 'owner', review_status: 'approved', shared_with: ['friend'] }
  const records = (['public', 'friends', 'private'] as const).flatMap(visibility =>
    (['approved', 'pending', 'rejected'] as const).map(review_status =>
      ({ ...base, id: visibility+'-'+review_status, visibility, review_status })))
  // Identity verification does not substitute for approval or gate an approved record.
  records.push({ ...base, id: 'unverified-approved', author: { ...base.author, verified: false } })
  const catalogJson = JSON.stringify(mergeCatalog([], records))
  const catalog = JSON.parse(catalogJson)
  assert.deepEqual(catalog.map((a: { id: string }) => a.id), ['public-approved', 'unverified-approved'])
  for (const field of ['owner_uid', 'review_status', 'shared_with']) assert.ok(!catalogJson.includes(field))
  for (const visibility of ['friends', 'private'] as const) {
    assert.ok(!mergeCatalog(SEED_AGENTS, [{ ...base, visibility }]).some(a => a.id === base.id))
  }
  assert.throws(() => mergeCatalog([], [base, base]))
  assert.throws(() => mergeCatalog([SEED_AGENTS[0], SEED_AGENTS[0]], []))
  for (const patch of [
    { owner_uid: undefined }, { owner_uid: '' }, { review_status: undefined }, { review_status: 'unknown' },
    { shared_with: undefined }, { shared_with: [1] }, { shared_with: Array(101).fill('friend') },
    { unexpected: true }, { input_schema: { type: 'bad-type' } },
  ]) {
    assert.throws(() => validateAgentRecord({ ...base, ...patch }))
    assert.throws(() => mergeCatalog([], [{ ...base, visibility: 'private', ...patch }]))
  }
})

test('seeds have the registry identity and web search matches an AgentForge handle', () => {
  for (const seed of SEED_AGENTS) {
    assert.deepEqual(seed.author, { uid: 'agentforge', name: 'AgentForge', handle: 'agentforge', verified: true })
    assert.equal(seed.visibility, 'public')
    assert.equal(seed.schema_version, 2)
  }
  const agent = { ...SEED_AGENTS[0], author: { ...SEED_AGENTS[0].author, handle: 'unique-author-42' } }
  assert.deepEqual(queryAgents([agent], { ...DEFAULT_QUERY, keyword: 'UNIQUE-AUTHOR-42' }), [agent])
})
