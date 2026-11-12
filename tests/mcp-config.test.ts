import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  MCP_CLIENTS,
  MCP_SERVER_PACKAGE,
  MCP_SERVER_SPEC,
  MCP_SERVER_VERSION,
  buildInstallSnippet,
  buildMcpConfig,
  buildServerEntry,
} from '../src/lib/mcpConfig'

test('Codex is offered as a CLI install using the documented stdio command', () => {
  assert.deepEqual(
    MCP_CLIENTS.find((client) => client.id === 'codex'),
    {
      id: 'codex',
      label: 'OpenAI Codex',
      configFile: null,
      locations: [],
    },
  )
  assert.equal(MCP_SERVER_PACKAGE, 'agentforge-registry')
  for (const agent of SEED_AGENTS) {
    assert.equal(
      buildInstallSnippet(agent, 'codex'),
      `codex mcp add agentforge-${agent.id} -- npx -y ${MCP_SERVER_SPEC} --agent ${agent.id}@${agent.version}`,
    )
  }
  assert.match(
    buildInstallSnippet(
      { id: 'example-agent', version: '2.0.0-rc.1+build.2' },
      'codex',
    ),
    /--agent example-agent@2\.0\.0-rc\.1\+build\.2$/,
  )
})

test('all clients preserve the same package, server key, and exact version pin', () => {
  const agent = SEED_AGENTS[0]
  assert.deepEqual(buildMcpConfig(agent), {
    mcpServers: { [`agentforge-${agent.id}`]: buildServerEntry(agent) },
  })
  for (const client of ['claude_desktop', 'cursor'] as const) {
    assert.deepEqual(
      JSON.parse(buildInstallSnippet(agent, client)),
      buildMcpConfig(agent),
    )
  }
  assert.equal(
    buildInstallSnippet(agent, 'claude_code'),
    `claude mcp add agentforge-${agent.id} -- npx -y ${MCP_SERVER_SPEC} --agent ${agent.id}@${agent.version}`,
  )
})

test('install spec points at a released tarball that is committed to the site', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const pkg = JSON.parse(
    readFileSync('packages/mcp-server/package.json', 'utf8'),
  )
  assert.equal(pkg.name, MCP_SERVER_PACKAGE)
  assert.equal(pkg.version, MCP_SERVER_VERSION)
  assert.equal(
    MCP_SERVER_SPEC,
    `https://agentforge-b10db.web.app/mcp/agentforge-registry-${pkg.version}.tgz`,
  )
  assert.ok(
    existsSync(`public/mcp/agentforge-registry-${pkg.version}.tgz`),
    'Run `npm run release:mcp` and commit the tarball before bumping the version.',
  )
})
