import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { SEED_AGENTS } from '../src/data/seedAgents'

const run = promisify(execFile)
const executable = resolve('packages/mcp-server/dist/cli.js')
const offline = `data:text/javascript,${encodeURIComponent("globalThis.fetch = async () => { throw new Error('offline') }")}`

test('CLI and environment catalog overrides preserve precedence and fail closed', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'agentforge-overrides-'))
  const valid = join(cwd, 'valid.json')
  const invalid = join(cwd, 'invalid.json')
  const agent = { ...SEED_AGENTS[0], name: 'Override catalog agent' }
  await writeFile(valid, JSON.stringify([agent]))
  await writeFile(invalid, '{}')
  try {
    for (const [args, source] of [
      [[], valid],
      [['--catalog', valid], invalid],
    ] as const) {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          '--import',
          offline,
          executable,
          ...args,
          '--agent',
          `${agent.id}@${agent.version}`,
        ],
        cwd,
        env: { ...getDefaultEnvironment(), AGENTFORGE_CATALOG_URL: source },
        stderr: 'pipe',
      })
      const client = new Client({ name: 'override-test', version: '1.0.0' })
      try {
        await client.connect(transport)
        assert.match(
          JSON.stringify(
            await client.readResource({ uri: 'agentforge://active/manifest' }),
          ),
          /Override catalog agent/,
        )
      } finally {
        await client.close()
      }
    }
    for (const [args, source] of [
      [[], invalid],
      [['--catalog', invalid], valid],
      [[], 'https://example.invalid/catalog.json'],
      [['--catalog', 'https://example.invalid/catalog.json'], valid],
      [[], ''],
    ] as const) {
      await assert.rejects(
        run(process.execPath, ['--import', offline, executable, ...args], {
          cwd,
          env: { ...process.env, AGENTFORGE_CATALOG_URL: source },
          timeout: 10_000,
          windowsHide: true,
        }),
        (
          error: Error & { code?: number; stdout?: string; stderr?: string },
        ) => {
          assert.equal(error.code, 1)
          assert.equal(error.stdout, '')
          assert.match(error.stderr ?? '', /^agentforge-registry:/)
          return true
        },
      )
    }
  } finally {
    assert.equal(dirname(cwd), resolve(tmpdir()))
    assert.ok(cwd.startsWith(join(resolve(tmpdir()), 'agentforge-overrides-')))
    await rm(cwd, { recursive: true, force: true })
  }
})
