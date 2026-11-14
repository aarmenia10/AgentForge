// Smoke-tests a deployed connector over real HTTP with the MCP SDK client.
// Usage: node smoke.mjs https://<host>      (exits non-zero on any failure)
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base)
  throw new Error('Pass the connector origin, e.g. https://example.workers.dev')
const check = (ok, label) => {
  if (!ok) throw new Error(`FAILED: ${label}`)
  console.log(`ok  ${label}`)
}

// A new deployment can take a few seconds to answer on its public address.
let home
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    home = await fetch(`${base}/`)
    if (home.ok) break
  } catch {
    // retry below
  }
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
check(home?.ok, `GET ${base}/ answers`)
console.log((await home.text()).split('\n').filter(Boolean).join(' | '))

const client = new Client({ name: 'connector-smoke', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
check(
  client.getServerVersion()?.name === 'agentforge-connector',
  'MCP initialize',
)
check(
  /Never use the first plausible search result/.test(
    client.getInstructions() ?? '',
  ),
  'guide is in the instructions',
)

const tools = (await client.listTools()).tools.map((tool) => tool.name)
check(
  tools.join(',') === 'search_registry,compare_agents,get_agent',
  `tools: ${tools.join(', ')}`,
)

const parse = (result) => JSON.parse(result.content[0].text)
const search = parse(
  await client.callTool({ name: 'search_registry', arguments: { limit: 20 } }),
)
check(
  search.candidates.length >= 2,
  `search_registry returned ${search.candidates.length} candidates`,
)

const ids = search.candidates.slice(0, 2).map((candidate) => candidate.id)
const compared = await client.callTool({
  name: 'compare_agents',
  arguments: { agent_ids: ids },
})
check(!compared.isError, `compare_agents on ${ids.join(' and ')}`)

const loaded = parse(
  await client.callTool({ name: 'get_agent', arguments: { agent_id: ids[0] } }),
)
check(
  loaded.agent.id === ids[0] && loaded.blueprint.length > 0 && loaded.notice,
  `get_agent ${ids[0]}`,
)

const missing = await client.callTool({
  name: 'get_agent',
  arguments: { agent_id: 'not-a-real-agent' },
})
check(missing.isError === true, 'unknown agent fails closed')

const guide = await client.readResource({ uri: 'agentforge://guide' })
check(guide.contents[0].text.length > 5000, 'registry_guide resource')
await client.close()
console.log(`\nConnector is live: ${base}/mcp`)
