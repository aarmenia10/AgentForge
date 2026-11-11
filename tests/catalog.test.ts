import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  validateCatalog,
  validateManifest,
  createSchemaValidator,
} from '../src/lib/validateManifest'
import { mergeCatalog } from '../scripts/export-catalog'
import { createFirestoreAgentRepository } from '../src/lib/agentRepository'

test('ten curated seeds and the serialized snapshot satisfy the strict contract', async () => {
  const agents = validateCatalog([...SEED_AGENTS])
  assert.equal(agents.length, 10)
  assert.equal(new Set(agents.map((a) => a.id)).size, 10)
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

test('live records override seeds; revocation suppresses seed; invalid live records fail', () => {
  const base = SEED_AGENTS[0]
  const live = { ...base, version: '1.1.0', stats: { ...base.stats, stars: 5 } }
  assert.equal(
    mergeCatalog(SEED_AGENTS, [live]).find((a) => a.id === base.id)?.stats
      .stars,
    5,
  )
  assert.equal(
    mergeCatalog(SEED_AGENTS, [
      { ...live, author: { ...live.author, verified: false } },
    ]).length,
    9,
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
    assert.equal((await offline.listAgents()).length, 10)
    fetchMock.mock.mockImplementation(
      async () => new Response('<html>SPA fallback</html>'),
    )
    assert.equal((await offline.listAgents()).length, 10)
    fetchMock.mock.mockImplementation(
      async () => new Response('error', { status: 503 }),
    )
    assert.equal((await offline.listAgents()).length, 10)
  } finally {
    fetchMock.mock.restore()
  }
})
