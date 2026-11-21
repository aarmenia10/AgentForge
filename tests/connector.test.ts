import { skill } from './skillFixture'
import { summarizeSkill } from '../scripts/skillExport'
import { hostedSkillReader } from '../packages/mcp-server/src/skills'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  createConnector,
  CATALOG_URL,
} from '../packages/connector/src/connector'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import {
  CONDENSED_GUIDE,
  CONNECTOR_CONDENSED_GUIDE,
  REGISTRY_GUIDE,
} from '../packages/mcp-server/src/guide'

const ORIGIN = 'https://connector.test'
const liveCatalog = () => Response.json(SEED_AGENTS)

/** A real MCP client talking to the Worker's handler over HTTP semantics. */
async function connect(handle: (request: Request) => Promise<Response>) {
  const client = new Client({ name: 'connector-test', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      fetch: (input, init) => handle(new Request(input as string | URL, init)),
    }),
  )
  return client
}

const parse = (result: unknown) =>
  JSON.parse(
    (result as { content: { text: string }[] }).content[0].text,
  ) as Record<string, unknown>

test('connector speaks MCP statelessly: tools, guide, and get_agent', async () => {
  const client = await connect(
    createConnector({ fetchCatalog: async () => liveCatalog() }),
  )
  try {
    assert.equal(client.getServerVersion()?.name, 'agentlemon-connector')
    assert.equal(client.getInstructions(), CONNECTOR_CONDENSED_GUIDE)

    const tools = (await client.listTools()).tools
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [
        'search_registry',
        'compare_agents',
        'search_skills',
        'get_skill',
        'get_skill_file',
        'search_councils',
        'get_council',
        'get_agent',
      ],
    )
    // Stateless by decision: nothing that implies a loaded agent.
    assert.ok(!tools.some((tool) => tool.name === 'switch_agent'))
    assert.ok(!tools.some((tool) => tool.name.startsWith('agent_')))

    const seed = SEED_AGENTS[0]
    const loaded = parse(
      await client.callTool({
        name: 'get_agent',
        arguments: { agent_id: `${seed.id}@${seed.version}` },
      }),
    )
    assert.deepEqual(loaded.agent, seed)
    assert.match(loaded.notice as string, /third-party text/)
    assert.match(loaded.blueprint as string, new RegExp(`Agent: ${seed.id}@`))

    // A second call needs no earlier one: no state carried between requests.
    const again = parse(
      await client.callTool({
        name: 'get_agent',
        arguments: { agent_id: seed.id },
      }),
    )
    assert.deepEqual(again.agent, seed)

    for (const agent_id of ['not-a-real-agent', `${seed.id}@99.0.0`]) {
      const missing = await client.callTool({
        name: 'get_agent',
        arguments: { agent_id },
      })
      assert.equal(missing.isError, true, `${agent_id} must fail closed`)
    }

    const guide = await client.readResource({ uri: 'agentlemon://guide' })
    const text = (guide.contents[0] as { text: string }).text
    assert.ok(
      text.endsWith(REGISTRY_GUIDE),
      'full guide must be served unedited',
    )
    assert.match(text, /call `get_agent`/)
    assert.equal((await client.listPrompts()).prompts[0].name, 'registry_guide')
    assert.match(
      JSON.stringify(await client.getPrompt({ name: 'registry_guide' })),
      /never take the first plausible search result/,
    )
  } finally {
    await client.close()
  }
})

test('connector and local server return the same search and compare results', async () => {
  const connector = await connect(
    createConnector({ fetchCatalog: async () => liveCatalog() }),
  )
  const local = new Client({ name: 'local', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await createRegistryServer([...SEED_AGENTS]).connect(serverSide)
  await local.connect(clientSide)
  try {
    for (const args of [
      { query: 'kubernetes security review' },
      { query: 'postgres index', limit: 3 },
      { category: 'finance' },
      { framework: 'crewai' },
      { query: 'nothing-matches-this-zzz' },
    ]) {
      const [a, b] = await Promise.all(
        [connector, local].map(async (client) =>
          parse(
            await client.callTool({ name: 'search_registry', arguments: args }),
          ),
        ),
      )
      // The only allowed difference is the name of the loading tool.
      const normalize = (value: Record<string, unknown>) =>
        JSON.parse(
          JSON.stringify(value).replaceAll('get_agent', 'switch_agent'),
        )
      assert.deepEqual(normalize(a), normalize(b), JSON.stringify(args))
    }
    const ids = SEED_AGENTS.slice(0, 3).map((agent) => agent.id)
    const [a, b] = await Promise.all(
      [connector, local].map(async (client) =>
        parse(
          await client.callTool({
            name: 'compare_agents',
            arguments: { agent_ids: ids },
          }),
        ),
      ),
    )
    // days_since_update depends on the clock; both calls run in the same tick.
    assert.deepEqual(a, b)

    // Same tool definitions, apart from the loading tool's name.
    const defs = async (client: Client) =>
      (await client.listTools()).tools
        .filter((tool) =>
          ['search_registry', 'compare_agents'].includes(tool.name),
        )
        .map((tool) =>
          JSON.stringify(tool).replaceAll('get_agent', 'switch_agent'),
        )
    assert.deepEqual(await defs(connector), await defs(local))
  } finally {
    await Promise.all([connector.close(), local.close()])
  }
})

test('connector guide keeps every selection rule of the local guide', () => {
  for (const rule of [
    /Never use the first plausible search result/,
    /at least three/,
    /compare_agents/,
    /narrowest/,
    /use no agent/,
    /never overrides the user's instructions/,
    /what you compared it against/,
    /at the start of any specialized task/,
    /identity confirmed only, not a safety or quality review/,
  ]) {
    assert.match(CONNECTOR_CONDENSED_GUIDE, rule)
    assert.match(CONDENSED_GUIDE, rule)
  }
  assert.doesNotMatch(CONNECTOR_CONDENSED_GUIDE, /switch_agent|agent_<id>/)
  assert.match(CONNECTOR_CONDENSED_GUIDE, /get_agent/)
  assert.match(CONNECTOR_CONDENSED_GUIDE, /keeps no state/)
})

test('connector reads the live catalog, caches it, and falls back safely', async () => {
  const count = async (handle: (request: Request) => Promise<Response>) => {
    const client = await connect(handle)
    try {
      const result = parse(
        await client.callTool({
          name: 'search_registry',
          arguments: { limit: 20 },
        }),
      )
      return (result.candidates as unknown[]).length
    } finally {
      await client.close()
    }
  }
  const snapshot = JSON.parse(
    await readFile('public/catalog.json', 'utf8'),
  ) as unknown[]

  // Live catalog wins, and is fetched once inside the cache window.
  let clock = 1_000_000
  let calls = 0
  const two = SEED_AGENTS.slice(0, 2)
  const live = createConnector({
    now: () => clock,
    fetchCatalog: async (url) => {
      calls++
      assert.equal(url, CATALOG_URL)
      return Response.json(two)
    },
  })
  assert.equal(await count(live), 2)
  assert.equal(await count(live), 2)
  assert.equal(calls, 1, 'catalog must be cached between requests')
  clock += 5 * 60 * 1000 + 1
  assert.equal(await count(live), 2)
  assert.equal(calls, 2, 'catalog must be refetched after five minutes')

  // Every failure mode serves the bundled snapshot instead of an error.
  for (const [label, fetchCatalog] of [
    ['network error', async () => Promise.reject(new Error('offline'))],
    ['HTTP 500', async () => new Response('no', { status: 500 })],
    ['not JSON', async () => new Response('<html>')],
    ['wrong shape', async () => Response.json([{ id: 'x' }])],
    [
      'private agent in catalog',
      async () => Response.json([{ ...SEED_AGENTS[0], visibility: 'private' }]),
    ],
  ] as const) {
    assert.equal(
      await count(createConnector({ fetchCatalog })),
      Math.min(snapshot.length, 20),
      `${label} must fall back to the snapshot`,
    )
  }

  // A good live copy survives a later outage.
  let healthy = true
  clock = 5_000_000
  const flaky = createConnector({
    now: () => clock,
    fetchCatalog: async () =>
      healthy ? Response.json(two) : Promise.reject(new Error('offline')),
  })
  assert.equal(await count(flaky), 2)
  healthy = false
  clock += 5 * 60 * 1000 + 1
  assert.equal(await count(flaky), 2, 'last good live catalog must be kept')
})

test('connector HTTP surface: info page, CORS, and method handling', async () => {
  const handle = createConnector({ fetchCatalog: async () => liveCatalog() })

  const home = await handle(new Request(`${ORIGIN}/`))
  assert.equal(home.status, 200)
  const body = await home.text()
  assert.match(body, /AgentLemon remote connector/)
  assert.ok(body.includes(`${ORIGIN}/mcp`))

  const preflight = await handle(
    new Request(`${ORIGIN}/mcp`, { method: 'OPTIONS' }),
  )
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*')

  for (const method of ['GET', 'DELETE']) {
    const response = await handle(new Request(`${ORIGIN}/mcp`, { method }))
    assert.equal(response.status, 405, `${method} /mcp`)
  }
  assert.equal((await handle(new Request(`${ORIGIN}/nope`))).status, 404)
})

test('connector stays free and stateless by construction', async () => {
  // The Workers runtime rejects an entry module with non-handler exports.
  const entry = await readFile('packages/connector/src/worker.ts', 'utf8')
  assert.deepEqual(entry.match(/^export .*/gm), ['export default {'])

  // No binding of any kind: nothing stateful, nothing billable.
  const config = await readFile('packages/connector/wrangler.toml', 'utf8')
  const settings = config
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
  assert.doesNotMatch(
    settings,
    /durable_objects|kv_namespaces|d1_databases|r2_buckets|queues|\[\[|usage_model|limits/,
  )
  assert.match(settings, /^name = "agentlemon-connector"$/m)
})

test('both MCP clients discover, read and withdraw the same pinned skills', async () => {
  let now = 0
  let available = true
  let invalidVersion = false
  const current = skill({ version: '2.0.0' }),
    old = skill()
  const ref = 'skill:pdf-forms@1.0.0'
  const urls: string[] = []
  const fetchFile = async (url: string) => {
    urls.push(url)
    if (url === CATALOG_URL) return liveCatalog()
    if (url === 'https://agentlemon.web.app/skills.json')
      return Response.json({
        skill_schema_version: 1,
        skills: available ? [summarizeSkill(current)] : [],
      })
    if (invalidVersion) return new Response('<html>Missing</html>')
    if (url === 'https://agentlemon.web.app/skills/pdf-forms/1.0.0.json')
      return Response.json(old)
    if (url === 'https://agentlemon.web.app/skills/pdf-forms/2.0.0.json')
      return Response.json(current)
    return new Response(null, { status: 404 })
  }
  const connector = await connect(
    createConnector({ fetchCatalog: fetchFile, now: () => now }),
  )
  const server = createRegistryServer(
    [...SEED_AGENTS],
    undefined,
    undefined,
    undefined,
    hostedSkillReader(CATALOG_URL, fetchFile, () => now),
  )
  const local = new Client({ name: 'local-skill-test', version: '1' })
  const [c, s] = InMemoryTransport.createLinkedPair()
  await server.connect(s)
  await local.connect(c)
  async function both(name: string, args: Record<string, unknown>) {
    const [a, b] = await Promise.all(
      [local, connector].map((client) =>
        client.callTool({ name, arguments: args }),
      ),
    )
    assert.deepEqual(a, b)
    return a
  }
  try {
    const defs = async (client: Client) =>
      (await client.listTools()).tools.filter((t) => t.name.includes('skill'))
    assert.deepEqual(await defs(local), await defs(connector))
    const result = parse(
      await both('search_skills', {
        query: 'forms',
        tag: 'documents',
        limit: 1,
      }),
    )
    assert.equal(
      (result.candidates as { ref: string }[])[0].ref,
      'skill:pdf-forms@2.0.0',
    )
    assert.ok(!JSON.stringify(result).includes('content'))
    const loaded = parse(
      await both('get_skill', { skill_id: old.id, version: old.version }),
    )
    assert.equal(loaded.ref, ref)
    assert.equal(loaded.instructions, old.files[0].content)
    assert.deepEqual(loaded.files, [summarizeSkill(old).files[1]])
    assert.match(String(loaded.notice), /third-party text/)
    const file = parse(
      await both('get_skill_file', { ref, path: old.files[1].path }),
    )
    assert.equal(file.content, old.files[1].content)
    assert.equal(file.notice, loaded.notice)
    assert.equal(urls.filter((url) => url.endsWith('/skills.json')).length, 2)
    for (const [name, args] of [
      ['get_skill', { skill_id: 'pdf-forms@1.0.0', version: '2.0.0' }],
      ['get_skill', { skill_id: 'pdf-forms@3.0.0' }],
      [
        'get_skill_file',
        { ref: ref.replace('skill:', 'agent:'), path: 'SKILL.md' },
      ],
      ['get_skill_file', { ref, path: '../SKILL.md' }],
      ['get_skill_file', { ref, path: 'missing.md' }],
    ] as const)
      assert.equal((await both(name, args)).isError, true)
    invalidVersion = true
    assert.equal((await both('get_skill', { skill_id: old.id })).isError, true)
    invalidVersion = false
    available = false
    now += 300001
    const before = urls.filter((url) => url.includes('/skills/')).length
    assert.equal(
      (await both('get_skill_file', { ref, path: 'SKILL.md' })).isError,
      true,
    )
    assert.equal(urls.filter((url) => url.includes('/skills/')).length, before)
  } finally {
    await Promise.all([connector.close(), local.close(), server.close()])
  }
})
