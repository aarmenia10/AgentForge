import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createConnectorServer } from '../packages/connector/src/server'
import {
  ACADEMY_CONNECTOR_URL,
  ACADEMY_STEPS,
  ACADEMY_TAGLINE,
  academyMinutes,
  academyTutorPrompt,
} from '../src/lib/academy'
import { MCP_CONNECTOR_URL } from '../src/lib/mcpConfig'
import { ACCOUNT_RESOURCE } from '../src/services/connectorConfig'

test('Academy steps have stable, unique ids and fit the course time', () => {
  const ids = ACADEMY_STEPS.map((step) => step.id)
  assert.ok(ids.every((id) => id.trim().length > 0))
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(ids, [
    'what',
    'connect',
    'agent',
    'skill',
    'make-skill',
    'make-agent',
    'next',
  ])
  assert.ok(academyMinutes() >= 10 && academyMinutes() <= 15)
})

test('the Academy tutor names tools offered by the signed-in connector', async () => {
  const tutor = academyTutorPrompt()
  assert.ok(tutor.length < 3500)
  const toolNames = [...new Set(tutor.match(/\b[a-z]+(?:_[a-z]+)+\b/g))]

  const server = createConnectorServer([], undefined, undefined, async () =>
    assert.fail('This test only lists tools'),
  )
  const client = new Client({ name: 'academy-test', version: '1.0.0' })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    const available = new Set(
      (await client.listTools()).tools.map(({ name }) => name),
    )
    for (const name of toolNames) {
      assert.ok(available.has(name), `Unknown connector tool: ${name}`)
    }
    assert.deepEqual(toolNames, [
      'account_status',
      'search_registry',
      'get_agent',
      'search_skills',
      'get_skill',
      'save_skill',
      'save_agent',
      'list_my_items',
    ])
  } finally {
    await client.close()
    await server.close()
  }
})

test('Academy content uses only the signed-in connector link', () => {
  assert.equal(ACADEMY_CONNECTOR_URL, ACCOUNT_RESOURCE)
  assert.equal(new URL(ACADEMY_CONNECTOR_URL).pathname, '/account/mcp')
  assert.ok(academyTutorPrompt().includes(ACADEMY_CONNECTOR_URL))
  assert.equal(
    ACADEMY_STEPS.find(({ id }) => id === 'connect')?.copy?.text,
    ACADEMY_CONNECTOR_URL,
  )
  for (const text of [
    academyTutorPrompt(),
    ...ACADEMY_STEPS.map((step) => JSON.stringify(step)),
  ]) {
    assert.ok(!text.includes(MCP_CONNECTOR_URL))
    for (const [url] of text.matchAll(/https?:\/\/[^\s"'<>]+?\/mcp\b/g)) {
      assert.equal(url, ACADEMY_CONNECTOR_URL)
    }
  }
})

test('Academy steps and tagline avoid technical jargon', () => {
  const banned = /\b(?:manifest|schema|json)\b/i
  assert.doesNotMatch(ACADEMY_TAGLINE, banned)
  for (const step of ACADEMY_STEPS) {
    assert.doesNotMatch(JSON.stringify(step), banned)
  }
})
