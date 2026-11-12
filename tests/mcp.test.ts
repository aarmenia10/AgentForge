import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createRegistryServer } from '../packages/mcp-server/src/server'
import { loadCatalog, selectAgent } from '../packages/mcp-server/src/catalog'

test('catalog loads local files and hosting URLs; missing pins and invalid sources fail closed', async () => {
  const catalog = await loadCatalog('public/catalog.json')
  assert.equal(catalog.length, SEED_AGENTS.length)
  assert.equal(
    selectAgent(catalog, 'postgres-index-tuner@1.0.0').version,
    '1.0.0',
  )
  assert.throws(() => selectAgent(catalog, 'postgres-index-tuner@9.9.9'))
  assert.throws(() => selectAgent(catalog, 'postgres-index-tuner@'))
  assert.throws(() => selectAgent(catalog, '../anything'))
  await assert.rejects(loadCatalog('does-not-exist.json'))
  const http = createServer((req, res) => {
    if (req.url === '/catalog.json') res.end(JSON.stringify(SEED_AGENTS))
    else if (req.url === '/bad') res.end('{}')
    else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const address = http.address() as { port: number }
  try {
    const url = `http://127.0.0.1:${address.port}`
    assert.equal((await loadCatalog(`${url}/catalog.json`)).length, SEED_AGENTS.length)
    await assert.rejects(loadCatalog(`${url}/bad`))
    await assert.rejects(loadCatalog(`${url}/missing`))
  } finally {
    await new Promise<void>((done) => http.close(() => done()))
  }
})

test('MCP session supports search, prompts, schemas, resources, switching and invalid input', async () => {
  const server = createRegistryServer(
    [...SEED_AGENTS],
    'python-regex-deobfuscator@1.0.0',
  )
  const client = new Client({ name: 'integration-test', version: '1.0.0' })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    assert.match(client.getInstructions()!, /Python regex engineer/)
    assert.match(client.getInstructions()!, /Never use the first plausible search result/)
    assert.deepEqual(
      (await client.listTools()).tools.map((t) => t.name),
      ['search_registry', 'compare_agents', 'switch_agent', 'agent_python_regex_deobfuscator'],
    )
    assert.equal((await client.listTools()).tools.length, 4)
    assert.equal((await client.listPrompts()).prompts[0].name, 'active_agent')
    assert.match(
      JSON.stringify(await client.getPrompt({ name: 'active_agent' })),
      /Verification rules/,
    )
    const search = await client.callTool({
      name: 'search_registry',
      arguments: { query: 'Postgres', category: 'coding' },
    })
    assert.match(JSON.stringify(search), /postgres-index-tuner/)
    assert.doesNotMatch(JSON.stringify(search), /solidity-reentrancy-guard/)
    assert.equal(
      (
        await client.callTool({
          name: 'search_registry',
          arguments: { unexpected: 1 },
        })
      ).isError,
      true,
    )
    assert.equal(
      (
        await client.callTool({
          name: 'agent_python_regex_deobfuscator',
          arguments: {},
        })
      ).isError,
      true,
    )
    const task = await client.callTool({
      name: 'agent_python_regex_deobfuscator',
      arguments: {
        pattern: '^a$',
        flags: [],
        match_mode: 'fullmatch',
        examples: ['a', 'b'],
        python_version: '3.12',
      },
    })
    assert.notEqual(task.isError, true)
    assert.match(JSON.stringify(task), /ready_for_client_execution/)
    const switched = await client.callTool({
      name: 'switch_agent',
      arguments: { agent_id: 'postgres-index-tuner@1.0.0' },
    })
    assert.notEqual(switched.isError, true)
    const tools = (await client.listTools()).tools
    assert.ok(tools.some((t) => t.name === 'agent_postgres_index_tuner'))
    assert.ok(!tools.some((t) => t.name === 'agent_python_regex_deobfuscator'))
    assert.match(
      JSON.stringify(
        await client.readResource({ uri: 'agentforge://active/manifest' }),
      ),
      /postgres-index-tuner/,
    )
    assert.equal(
      (
        await client.callTool({
          name: 'switch_agent',
          arguments: { agent_id: 'postgres-index-tuner@9.0.0' },
        })
      ).isError,
      true,
    )
    assert.match(
      JSON.stringify(await client.getPrompt({ name: 'active_agent' })),
      /PostgreSQL performance engineer/,
    )
    assert.equal(
      (
        await client.callTool({
          name: 'agent_python_regex_deobfuscator',
          arguments: {},
        })
      ).isError,
      true,
    )
  } finally {
    await client.close()
    await server.close()
  }
})

test('built Node executable speaks real stdio MCP and loads its bundled catalog outside the repo', async () => {
  const executable = resolve('packages/mcp-server/dist/cli.js')
  assert.match(await readFile(executable, 'utf8'), /^#!\/usr\/bin\/env node/)
  const cwd = await mkdtemp(join(tmpdir(), 'agentforge-stdio-'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      '--import',
      `data:text/javascript,${encodeURIComponent("globalThis.fetch = async () => { throw new Error('offline') }")}`,
      executable,
      '--agent',
      'sec-10k-auditor@1.0.0',
    ],
    cwd,
    stderr: 'pipe',
  })
  const client = new Client({ name: 'stdio-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    assert.equal((await client.listTools()).tools.length, 4)
    assert.match(
      client.getInstructions()!,
      /forensic financial-statement analyst/,
    )
    // The bundled executable carries the guide without reading docs/ at runtime.
    assert.match(client.getInstructions()!, /compare_agents/)
    const guide = await client.readResource({ uri: 'agentforge://guide' })
    assert.match(JSON.stringify(guide), /AgentForge registry guide for AI clients/)
  } finally {
    await client.close()
    await rm(cwd, { recursive: true, force: true })
  }
})

test('invalid CLI catalog exits unsuccessfully without protocol pollution', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'agentforge-invalid-'))
  const file = join(cwd, 'invalid.json')
  await writeFile(file, '{}')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('packages/mcp-server/dist/cli.js'), '--catalog', file],
    cwd,
    stderr: 'pipe',
  })
  const client = new Client({ name: 'invalid-test', version: '1.0.0' })
  try {
    await assert.rejects(client.connect(transport))
  } finally {
    await client.close()
    await rm(cwd, { recursive: true, force: true })
  }
})
