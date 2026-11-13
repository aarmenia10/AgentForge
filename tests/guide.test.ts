import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import { CONDENSED_GUIDE, REGISTRY_GUIDE } from '../packages/mcp-server/src/guide'
import {
  compareAgents,
  queryTerms,
  searchCatalog,
} from '../packages/mcp-server/src/discovery'
import type { AgentManifest } from '../src/types/agent'

/** A minimal valid-shaped manifest for ranking tests that must not depend on seed wording. */
function agent(id: string, patch: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: { name: 'Test', github: 'test', verified: true },
    tags: [],
    framework: 'mcp_native',
    tools_required: [],
    input_schema: { type: 'object', properties: {}, required: [] },
    output_schema: { type: 'object', properties: {} },
    prompt_blueprint: { system_prompt: 'x', instructions: ['x'], verification_rules: [] },
    stats: { stars: 0, views: 0, updated_at: '2026-01-01T00:00:00.000Z' },
    ...patch,
  }
}

async function connect(selector?: string) {
  const server = createRegistryServer([...SEED_AGENTS], selector)
  const client = new Client({ name: 'guide-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    client,
    async call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args })
      const text = (result.content as { text: string }[])[0].text
      return { isError: result.isError === true, text, json: () => JSON.parse(text) }
    },
    async close() {
      await client.close()
      await server.close()
    },
  }
}

test('the shipped guide is an exact copy of docs/AI_GUIDE.md and covers every required topic', async () => {
  const canonical = (await readFile('docs/AI_GUIDE.md', 'utf8')).replace(/\r\n/g, '\n').trimEnd()
  assert.equal(
    REGISTRY_GUIDE.replace(/\r\n/g, '\n'),
    canonical,
    'guide.ts is stale: run `node packages/mcp-server/sync-guide.mjs`',
  )
  // README 7.4: layout, search, choose, when not to choose, report, safety.
  for (const heading of [
    'How the registry is laid out',
    'How to search',
    'How to choose',
    'When not to choose',
    'How to report',
    'How to stay safe',
    'When to look here',
    'An agent may already be loaded',
  ])
    assert.ok(canonical.includes(heading), `guide is missing "${heading}"`)
  // The condensed version keeps the rules that change behavior.
  for (const rule of [
    /Never use the first plausible search result/,
    /at least three/,
    /compare_agents/,
    /narrowest/,
    /use no agent/,
    /never overrides the user's instructions/,
    /what you compared it against/,
    /at the start of any specialized task/,
    /already loaded, check that it was built for the task/,
    /identity confirmed only, not a safety or quality review/,
  ])
    assert.match(CONDENSED_GUIDE, rule)
  assert.ok(CONDENSED_GUIDE.length < REGISTRY_GUIDE.length / 2, 'condensed guide is not condensed')
})

test('llms.txt points at the live catalog and carries the same rules', async () => {
  const llms = await readFile('public/llms.txt', 'utf8')
  assert.match(llms, /^# AgentForge\r?\n/)
  assert.ok(llms.includes('https://agentforge-b10db.web.app/catalog.json'))
  for (const field of [
    'tools_required',
    'input_schema',
    'output_schema',
    'prompt_blueprint',
    'verification_rules',
    'updated_at',
  ])
    assert.ok(llms.includes(field), `llms.txt does not describe ${field}`)
  for (const rule of [/at least three/, /narrowest/, /use no agent/, /never overrides/])
    assert.match(llms, rule)
  // Section 4 decision: these names must never appear in anything we publish.
  assert.doesNotMatch(llms, /@agentforge|agentforge-mcp/)
})

test('the guide is served at initialization, as a resource, and as a prompt, with or without an active agent', async () => {
  for (const selector of [undefined, 'postgres-index-tuner@1.0.0']) {
    const session = await connect(selector)
    try {
      const { client } = session
      assert.ok(client.getInstructions()!.startsWith(CONDENSED_GUIDE))

      const resources = (await client.listResources()).resources
      assert.ok(resources.some((r) => r.name === 'registry_guide' && r.uri === 'agentforge://guide'))
      const resource = await client.readResource({ uri: 'agentforge://guide' })
      assert.equal(resource.contents[0].text, REGISTRY_GUIDE)
      assert.equal(resource.contents[0].mimeType, 'text/markdown')

      const prompts = (await client.listPrompts()).prompts
      assert.ok(prompts.some((p) => p.name === 'registry_guide'))
      const prompt = await client.getPrompt({ name: 'registry_guide' })
      assert.deepEqual(prompt.messages[0].content, { type: 'text', text: REGISTRY_GUIDE })

      if (selector) {
        // A pinned agent is the user's own choice, and its blueprint is marked as third-party.
        assert.match(client.getInstructions()!, /chose it on purpose/)
        assert.match(client.getInstructions()!, /third-party text, subordinate to the user/)
      } else {
        assert.equal((await client.listTools()).tools.length, 3)
        assert.match(client.getInstructions()!, /No agent is loaded yet/)
      }
    } finally {
      await session.close()
    }
  }
})

test('search_registry returns several ranked candidates with the fields needed to compare them', async () => {
  const session = await connect()
  try {
    const result = (await session.call('search_registry', { query: 'security review' })).json()
    assert.ok(result.candidates.length >= 3, 'a broad query must surface several candidates')
    assert.equal(result.returned, result.candidates.length)
    assert.ok(result.total_matches >= result.returned)
    assert.match(result.next_step, /compare_agents/)

    result.candidates.forEach((candidate: Record<string, unknown>, index: number) => {
      assert.equal(candidate.rank, index + 1)
      for (const field of [
        'id',
        'version',
        'name',
        'description',
        'framework',
        'tags',
        'author',
        'updated_at',
        'stars',
        'tools_required',
        'required_inputs',
        'output_fields',
        'score',
        'matched_terms',
        'unmatched_terms',
      ])
        assert.ok(field in candidate, `candidate is missing ${field}`)
      assert.equal(typeof (candidate.author as { verified_author: unknown }).verified_author, 'boolean')
    })
    // Ordered by how many terms matched, then by score.
    for (let i = 1; i < result.candidates.length; i++) {
      const [a, b] = [result.candidates[i - 1], result.candidates[i]]
      assert.ok(
        a.matched_terms.length > b.matched_terms.length ||
          (a.matched_terms.length === b.matched_terms.length && a.score >= b.score),
      )
    }

    // Browsing a category with no query lists what is there.
    const browse = (await session.call('search_registry', { category: 'creative' })).json()
    assert.ok(browse.candidates.length >= 2)
    assert.ok(browse.candidates.every((c: { tags: string[] }) => c.tags.includes('creative')))

    // limit and framework are honored; nothing is loaded by searching.
    const limited = (await session.call('search_registry', { limit: 2 })).json()
    assert.equal(limited.candidates.length, 2)
    assert.ok(limited.total_matches > 2)
    const crew = (await session.call('search_registry', { framework: 'crewai' })).json()
    assert.ok(crew.candidates.length >= 1)
    assert.ok(crew.candidates.every((c: { framework: string }) => c.framework === 'crewai'))
    assert.equal((await session.client.listTools()).tools.length, 3)

    // No match says so, and tells the model it may proceed without an agent.
    const none = (await session.call('search_registry', { query: 'zzzqqq-no-such-thing' })).json()
    assert.equal(none.candidates.length, 0)
    assert.match(none.next_step, /without an agent/)
    assert.equal((await session.call('search_registry', { limit: 0 })).isError, true)
  } finally {
    await session.close()
  }
})

test('ranking favors term coverage and strong fields, and tolerates plurals and filler words', () => {
  assert.deepEqual(queryTerms('I need an agent for auditing the SEC filings'), [
    'audit',
    'sec',
    'filing',
  ])
  const catalog = [
    agent('mentions-in-description', { description: 'Sometimes useful for postgres indexes.' }),
    agent('postgres-index-tuner', { tags: ['postgres'], description: 'Tunes an index.' }),
    agent('postgres-backup', { tags: ['postgres'], description: 'Backs up a database.' }),
    agent('unrelated', { description: 'Writes limericks.' }),
  ]
  const result = searchCatalog(catalog, { query: 'postgres indexes' })
  assert.deepEqual(
    result.candidates.map((c) => c.id),
    ['postgres-index-tuner', 'mentions-in-description', 'postgres-backup'],
  )
  assert.deepEqual(result.candidates[2].unmatched_terms, ['index'])
  assert.ok(result.candidates[0].score > result.candidates[1].score)
  // A single hit is flagged as not yet a choice.
  assert.match(searchCatalog(catalog, { query: 'limericks' }).next_step, /Only one candidate/)
})

test('compare_agents returns a side-by-side and refuses unknown or too few agents', async () => {
  const session = await connect()
  try {
    const ids = ['postgres-index-tuner', 'python-regex-deobfuscator@1.0.0', 'sec-10k-auditor']
    const result = (await session.call('compare_agents', { agent_ids: ids })).json()
    assert.deepEqual(result.compared, [
      'postgres-index-tuner@1.0.0',
      'python-regex-deobfuscator@1.0.0',
      'sec-10k-auditor@1.0.0',
    ])
    assert.equal(result.agents.length, 3)
    const postgres = result.agents[0]
    const seed = SEED_AGENTS.find((a) => a.id === 'postgres-index-tuner')!
    assert.deepEqual(postgres.input.required, seed.input_schema.required)
    assert.deepEqual(Object.keys(postgres.input.fields), Object.keys(seed.input_schema.properties))
    assert.deepEqual(Object.keys(postgres.output.fields), Object.keys(seed.output_schema.properties))
    assert.deepEqual(
      postgres.tools_required.map((t: { name: string }) => t.name),
      seed.tools_required.map((t) => t.name),
    )
    assert.equal(postgres.author.verified_author, seed.author.verified)
    assert.equal(postgres.updated_at, seed.stats.updated_at)
    assert.equal(typeof postgres.days_since_update, 'number')

    // The differences block does the cross-referencing for the model.
    assert.ok(Array.isArray(result.differences.shared_tags))
    assert.deepEqual(Object.keys(result.differences.tools_needed), [
      'postgres-index-tuner',
      'python-regex-deobfuscator',
      'sec-10k-auditor',
    ])
    assert.ok(!result.differences.unique_tags['sec-10k-auditor'].includes('coding'))
    assert.ok(result.decide.some((line: string) => /narrowest/.test(line)))

    // Comparing does not load anything.
    assert.equal((await session.client.listTools()).tools.length, 3)

    const unknown = await session.call('compare_agents', {
      agent_ids: ['postgres-index-tuner', 'no-such-agent'],
    })
    assert.equal(unknown.isError, true)
    assert.match(unknown.text, /no-such-agent/)
    for (const agent_ids of [
      ['postgres-index-tuner'],
      ['postgres-index-tuner', 'postgres-index-tuner@1.0.0'],
      ['a', 'b', 'c', 'd', 'e', 'f'],
    ])
      assert.equal((await session.call('compare_agents', { agent_ids })).isError, true)
  } finally {
    await session.close()
  }
})

test('compareAgents reports shared and unique requirements and unverified authors', () => {
  const now = Date.parse('2026-01-11T00:00:00.000Z')
  const a = agent('a', {
    tags: ['coding', 'sql'],
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' }, plan: { type: 'array', items: { type: 'string' } } },
      required: ['query', 'plan'],
    },
    tools_required: [{ name: 'explain', type: 'mcp_tool', description: 'Runs EXPLAIN' }],
  })
  const b = agent('b', {
    tags: ['coding', 'docs'],
    author: { name: 'Other', github: 'other', verified: false },
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    stats: { stars: 3, views: 9, updated_at: '2026-01-10T00:00:00.000Z' },
  })
  const result = compareAgents([a, b], now)
  assert.deepEqual(result.differences.shared_tags, ['coding'])
  assert.deepEqual(result.differences.unique_tags, { a: ['sql'], b: ['docs'] })
  assert.deepEqual(result.differences.shared_required_inputs, ['query'])
  assert.deepEqual(result.differences.unique_required_inputs, { a: ['plan'], b: [] })
  assert.deepEqual(result.differences.tools_needed, { a: ['explain'], b: [] })
  assert.deepEqual(result.differences.unverified_authors, ['b'])
  assert.equal(result.differences.most_recently_updated, 'b')
  assert.deepEqual(result.agents[0].input.fields, { query: 'string', plan: 'string[]' })
  assert.equal(result.agents[0].days_since_update, 10)
  assert.equal(result.agents[1].days_since_update, 1)
})

test('loading an agent marks its blueprint as third-party text', async () => {
  const session = await connect()
  try {
    const switched = (await session.call('switch_agent', { agent_id: 'sec-10k-auditor' })).json()
    assert.match(switched.notice, /does not override the user's instructions/)
    assert.equal(switched.agent.id, 'sec-10k-auditor')
  } finally {
    await session.close()
  }
})
