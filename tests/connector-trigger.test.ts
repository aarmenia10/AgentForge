import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  triggerExport,
  type ExportTriggerEnv,
} from '../packages/connector/src/exportTrigger'

const TOKEN = 'ghp_test_token_value_that_must_never_be_logged'
const URL_OF_CI =
  'https://api.github.com/repos/aarmenia10/AgentForge/actions/workflows/ci.yml/dispatches'
const env: ExportTriggerEnv = {
  GITHUB_DISPATCH_TOKEN: TOKEN,
  GITHUB_REPO: 'aarmenia10/AgentForge',
}

interface Call {
  url: string
  init: RequestInit
}

/** Runs fn with console.error captured, and returns every line written. */
async function captureErrors(fn: () => Promise<void>) {
  const lines: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    await fn()
  } finally {
    console.error = original
  }
  return lines
}

function recorder(respond: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    return respond()
  }
  return { calls, fetcher }
}

test('export trigger without a token makes no request and stays quiet', async () => {
  for (const token of [undefined, '']) {
    const { calls, fetcher } = recorder(
      () => new Response(null, { status: 204 }),
    )
    const lines = await captureErrors(() =>
      triggerExport({ ...env, GITHUB_DISPATCH_TOKEN: token }, fetcher),
    )
    assert.equal(calls.length, 0)
    assert.deepEqual(lines, [])
  }
})

test('export trigger sends exactly one workflow_dispatch POST', async () => {
  const { calls, fetcher } = recorder(() => new Response(null, { status: 204 }))
  const lines = await captureErrors(() => triggerExport(env, fetcher))

  assert.deepEqual(lines, [])
  assert.equal(calls.length, 1)
  const [{ url, init }] = calls
  assert.equal(url, URL_OF_CI)
  assert.equal(init.method, 'POST')
  assert.equal(init.redirect, 'manual')
  assert.deepEqual(JSON.parse(String(init.body)), {
    ref: 'main',
    inputs: { scheduled: 'true' },
  })
  const headers = init.headers as Record<string, string>
  assert.equal(headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(headers.Accept, 'application/vnd.github+json')
  assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28')
  assert.equal(headers['User-Agent'], 'agentlemon-connector')
})

test('export trigger logs only the status code when GitHub refuses', async () => {
  for (const status of [403, 500]) {
    const { calls, fetcher } = recorder(
      () => new Response(`secret body ${TOKEN}`, { status }),
    )
    const lines = await captureErrors(() => triggerExport(env, fetcher))
    assert.equal(calls.length, 1)
    assert.deepEqual(lines, [
      `Export trigger failed: GitHub returned ${status}`,
    ])
  }
})

test('export trigger never logs the token, even when the request throws', async () => {
  const lines = await captureErrors(() =>
    triggerExport(env, async () => {
      throw new Error(`connect failed for Bearer ${TOKEN}`)
    }),
  )
  assert.equal(lines.length, 1)
  assert.ok(!lines[0].includes(TOKEN))
})

test('export trigger refuses a malformed repository without calling out', async () => {
  for (const GITHUB_REPO of [
    undefined,
    '',
    'no-slash',
    'a/b/../../c',
    'a/b?x=1',
  ]) {
    const { calls, fetcher } = recorder(
      () => new Response(null, { status: 204 }),
    )
    const lines = await captureErrors(() =>
      triggerExport({ ...env, GITHUB_REPO }, fetcher),
    )
    assert.equal(calls.length, 0, String(GITHUB_REPO))
    assert.equal(lines.length, 1)
    assert.ok(!lines[0].includes(TOKEN))
  }
})

test('worker.ts exports only the default handler, with fetch and scheduled', async () => {
  const source = await readFile('packages/connector/src/worker.ts', 'utf8')
  assert.deepEqual(source.match(/^export .*/gm), ['export default {'])

  const module = await import('../packages/connector/src/worker')
  assert.deepEqual(Object.keys(module), ['default'])
  assert.equal(typeof module.default.fetch, 'function')
  assert.equal(typeof module.default.scheduled, 'function')
})

test('the scheduled handler runs the trigger through the Worker runtime hooks', async () => {
  const { default: worker } = await import('../packages/connector/src/worker')
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    return new Response(null, { status: 204 })
  }) as typeof fetch
  try {
    const pending: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => void pending.push(promise),
    } as unknown as ExecutionContext
    const controller = {} as ScheduledController

    // No token: nothing is sent.
    worker.scheduled(controller, { GITHUB_REPO: env.GITHUB_REPO }, ctx)
    await Promise.all(pending)
    assert.equal(calls.length, 0)

    worker.scheduled(controller, env, ctx)
    await Promise.all(pending)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, URL_OF_CI)
  } finally {
    globalThis.fetch = original
  }
})

test('wrangler.toml has one cron at minute 17 and no bindings', async () => {
  const config = await readFile('packages/connector/wrangler.toml', 'utf8')
  const settings = config
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')

  assert.deepEqual(settings.match(/crons\s*=.*/g), ['crons = ["17 * * * *"]'])
  assert.match(settings, /^\[triggers\]$/m)
  assert.match(settings, /^GITHUB_REPO = "aarmenia10\/AgentForge"$/m)

  // Only these tables may exist. Any binding needs its own table or array.
  assert.deepEqual(settings.match(/^\[.*\]$/gm), [
    '[vars]',
    '[triggers]',
    '[observability]',
  ])
  const vars = settings.split('[vars]')[1].split('[triggers]')[0]
  assert.deepEqual(
    vars
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    ['GITHUB_REPO = "aarmenia10/AgentForge"'],
  )
  // A token must never be committed.
  assert.doesNotMatch(settings, /GITHUB_DISPATCH_TOKEN|ghp_|github_pat_/)
  assert.doesNotMatch(
    settings,
    /durable_objects|kv_namespaces|d1_databases|r2_buckets|queues|services|ai\b|vectorize|hyperdrive|analytics_engine|browser|send_email|mtls|dispatch_namespaces/,
  )
})

test('ci.yml: the connector dispatch behaves as a schedule run, a manual run does not', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8')

  // The dispatch input exists, off by default.
  assert.match(
    ci,
    /workflow_dispatch:\n {4}inputs:\n {6}scheduled:\n(?: {8}.*\n)*? {8}type: boolean\n {8}default: false\n/,
  )

  // A scheduled dispatch must never cancel a deploy in flight.
  assert.match(
    ci,
    /^ {2}cancel-in-progress: \$\{\{ github\.event_name != 'schedule' && !inputs\.scheduled \}\}$/m,
  )

  // The condition is defined once, and no step tests the event name itself.
  const lines = ci.split('\n')
  const eventTests = lines.filter((line) =>
    /github\.event_name == 'schedule'/.test(line),
  )
  assert.deepEqual(eventTests, [
    "      EXPORT_RUN_IS_SCHEDULED: ${{ github.event_name == 'schedule' || inputs.scheduled }}",
  ])
  assert.ok(ci.includes("env.EXPORT_RUN_IS_SCHEDULED == 'true'"))
})
