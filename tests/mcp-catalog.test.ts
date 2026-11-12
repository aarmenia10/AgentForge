import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  DEFAULT_CATALOG_URL,
  loadCatalog,
  selectAgent,
} from '../packages/mcp-server/src/catalog'

test('default catalog uses the live URL and validates the response', async (t) => {
  const remote = [{ ...SEED_AGENTS[0], name: 'Live catalog revision' }]
  const request = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://agentforge-b10db.web.app/catalog.json')
    assert.ok(options.signal instanceof AbortSignal)
    return new Response(JSON.stringify(remote))
  })
  assert.deepEqual(await loadCatalog(), remote)
  assert.equal(request.mock.callCount(), 1)
  // A valid live catalog that lacks a pin must not silently select a bundled pin.
  assert.throws(() => selectAgent(remote, 'postgres-index-tuner@1.0.0'))
})

const failures = [
  ['network error', () => Promise.reject(new Error('offline'))],
  [
    'timeout',
    () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
  ],
  ['HTTP error', async () => new Response('unavailable', { status: 503 })],
  [
    'HTML instead of JSON',
    async () => new Response('<html>SPA fallback</html>'),
  ],
  ['wrong catalog shape', async () => new Response('{}')],
  [
    'invalid manifest',
    async () =>
      new Response(JSON.stringify([{ ...SEED_AGENTS[0], version: 'invalid' }])),
  ],
  [
    'duplicate ids',
    async () => new Response(JSON.stringify([SEED_AGENTS[0], SEED_AGENTS[0]])),
  ],
  [
    'body read failure',
    async () => {
      const response = new Response('[]')
      response.text = async () => {
        throw new Error('connection interrupted')
      }
      return response
    },
  ],
] as const

for (const [name, response] of failures) {
  test(`default catalog falls back on ${name}; explicit URL fails closed`, async (t) => {
    const bundled = JSON.parse(
      await readFile('packages/mcp-server/catalog.json', 'utf8'),
    )
    const request = t.mock.method(globalThis, 'fetch', response)
    assert.deepEqual(await loadCatalog(), bundled)
    assert.equal(request.mock.calls[0].arguments[0], DEFAULT_CATALOG_URL)
    await assert.rejects(loadCatalog(DEFAULT_CATALOG_URL))
    await assert.rejects(loadCatalog('https://example.invalid/catalog.json'))
  })
}

test('empty valid remote catalog stays authoritative; empty explicit source fails closed', async (t) => {
  const request = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('[]'),
  )
  assert.deepEqual(await loadCatalog(), [])
  await assert.rejects(loadCatalog(''))
  await assert.rejects(loadCatalog('does-not-exist.json'))
  assert.equal(request.mock.callCount(), 1)
})
