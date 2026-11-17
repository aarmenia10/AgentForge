import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { agentResolver } from '../packages/mcp-server/src/catalog'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import { createConnector } from '../packages/connector/src/connector'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const old = SEED_AGENTS[0]
const latest = { ...old, version: '9.0.0', name: 'Newest version' }
const source = 'https://example.test/catalog.json'

test('local and connector resolve the same old pin; bad version responses fail closed', async (t) => {
  for (const body of [
    old,
    '<html>SPA fallback</html>',
    { ...old, id: 'wrong-id' },
    { ...old, version: '8.0.0' },
    { ...old, visibility: 'private' },
  ]) {
    const urls: string[] = []
    const fetchVersion = async (url: string) => {
      urls.push(url)
      return typeof body === 'string' ? new Response(body) : Response.json(body)
    }
    const mocked = t.mock.method(globalThis, 'fetch', fetchVersion)
    const resolver = agentResolver([latest], source)
    const local = new Client({ name: 'local-version-test', version: '1' })
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await createRegistryServer([latest], undefined, resolver).connect(
      serverSide,
    )
    await local.connect(clientSide)
    const handle = createConnector({
      fetchCatalog: async (url) =>
        url.endsWith('/catalog.json')
          ? Response.json([latest])
          : fetchVersion(url),
    })
    const remote = new Client({ name: 'remote-version-test', version: '1' })
    await remote.connect(
      new StreamableHTTPClientTransport(new URL('https://connector.test/mcp'), {
        fetch: (input, init) =>
          handle(new Request(input as string | URL, init)),
      }),
    )
    try {
      const a = await local.callTool({
        name: 'switch_agent',
        arguments: { agent_id: `${old.id}@${old.version}` },
      })
      const b = await remote.callTool({
        name: 'get_agent',
        arguments: { agent_id: old.id, version: old.version },
      })
      if (body === old) {
        assert.notEqual(a.isError, true)
        assert.deepEqual(a.content, b.content)
        assert.deepEqual(await resolver(`${old.id}@${old.version}`), old)
      } else {
        assert.equal(a.isError, true)
        assert.equal(b.isError, true)
        await assert.rejects(resolver(`${old.id}@${old.version}`))
      }
      assert.ok(
        urls.every((url) =>
          url.endsWith(`/agents/${old.id}/${old.version}.json`),
        ),
      )
      const before = urls.length
      assert.deepEqual(await resolver(old.id), latest)
      await assert.rejects(
        agentResolver([], source)(`${old.id}@${old.version}`),
      )
      assert.equal(
        urls.length,
        before,
        'missing catalog membership must never resurrect history',
      )
      assert.equal(
        (
          await remote.callTool({
            name: 'get_agent',
            arguments: {
              agent_id: `${old.id}@${old.version}`,
              version: '2.0.0',
            },
          })
        ).isError,
        true,
      )
    } finally {
      await Promise.all([local.close(), remote.close()])
      mocked.mock.restore()
    }
  }
})
