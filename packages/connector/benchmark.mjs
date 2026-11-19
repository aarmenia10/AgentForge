import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const manifest = {
  ...JSON.parse(
    readFileSync(new URL('../../public/catalog.json', import.meta.url), 'utf8'),
  )[0],
}
const cap = 200 * 1024
const instructions =
  '---\nname: cpu-benchmark\ndescription: Benchmark a private save.\n---\n\nBenchmark instructions.\n'
const skill = {
  skill_schema_version: 1,
  id: 'cpu-benchmark',
  name: 'cpu-benchmark',
  version: '1.0.0',
  description: 'Benchmark a private save.',
  tags: ['testing'],
  files: [
    { path: 'SKILL.md', kind: 'instructions', content: instructions },
    {
      path: 'references/one.md',
      kind: 'reference',
      content: 'a'.repeat(100 * 1024),
    },
    {
      path: 'references/two.md',
      kind: 'reference',
      content: 'b'.repeat(100 * 1024 - Buffer.byteLength(instructions)),
    },
  ],
}
function sizedAgent(bytes, fill = 'a') {
  const agent = { ...manifest, description: '' }
  agent.description = fill.repeat(
    bytes - Buffer.byteLength(JSON.stringify(agent)),
  )
  assert.equal(Buffer.byteLength(JSON.stringify(agent)), bytes)
  return agent
}

const config = readFileSync(new URL('./wrangler.toml', import.meta.url), 'utf8')
const { outputFiles } = await build({
  entryPoints: [
    fileURLToPath(new URL('./benchmark-worker.ts', import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  external: ['node:*'],
  conditions: ['workerd', 'worker'],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
})
const runtime = new Miniflare({
  workers: [
    {
      config: {
        name: 'connector-benchmark',
        compatibilityDate: config.match(/compatibility_date = "([^"]+)"/)[1],
        compatibilityFlags: ['nodejs_compat'],
        manifest: {
          mainModule: 'worker.mjs',
          modules: {
            'worker.mjs': { type: 'esm', contents: outputFiles[0].text },
          },
        },
      },
    },
  ],
})
const powershell = (command) =>
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8' },
  ).trim()

// Sample CPU time from the isolated workerd process. The Worker's clocks may
// pause during CPU work and elapsed time would also include the HTTP harness.
function cpuSampler() {
  if (process.platform === 'win32') {
    const pid = Number(
      powershell(
        `(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' | Where-Object Name -eq 'workerd.exe').ProcessId`,
      ),
    )
    assert.ok(pid > 0, 'workerd process is running')
    return () =>
      Number(
        powershell(
          `(Get-Process -Id ${pid}).TotalProcessorTime.TotalMilliseconds`,
        ).replace(',', '.'),
      )
  }
  if (process.platform === 'linux') {
    const ps = execFileSync(
      'ps',
      ['-o', 'pid=,comm=', '--ppid', String(process.pid)],
      { encoding: 'utf8' },
    )
    const pid = Number(/^\s*(\d+)\s+workerd\s*$/m.exec(ps)?.[1])
    assert.ok(pid > 0, 'workerd process is running')
    const ticks = Number(
      execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }),
    )
    return () => {
      const fields = readFileSync(`/proc/${pid}/stat`, 'utf8')
        .split(') ')[1]
        .split(' ')
      return ((Number(fields[11]) + Number(fields[12])) * 1000) / ticks
    }
  }
  throw new Error('The workerd CPU benchmark supports Windows and Linux.')
}

try {
  await runtime.ready
  const access = await (
    await runtime.dispatchFetch('http://localhost/benchmark-token')
  ).text()
  const cpu = cpuSampler()
  for (const [label, name, args] of [
    ['200 KiB agent', 'save_agent', { manifest: sizedAgent(cap) }],
    ['200 KiB skill', 'save_skill', { skill }],
    [
      '12 KiB agent with inline lint',
      'save_agent',
      { manifest: sizedAgent(12 * 1024) },
    ],
  ]) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    })
    async function save() {
      const response = await runtime.dispatchFetch(
        'http://localhost/account/mcp',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${access}`,
          },
          body,
        },
      )
      const payload = await response.json()
      assert.equal(response.status, 200, JSON.stringify(payload))
      assert.equal(payload.result?.isError, undefined, JSON.stringify(payload))
    }
    for (let i = 0; i < 40; i++) await save()
    const samples = []
    for (let sample = 0; sample < 3; sample++) {
      const before = cpu()
      for (let i = 0; i < 100; i++) await save()
      samples.push((cpu() - before) / 100)
    }
    const peak = Math.max(...samples)
    console.log(
      `${label}: ${samples.map((ms) => ms.toFixed(2)).join(', ')} ms CPU per save (limit 9 ms)`,
    )
    assert.ok(
      peak > 0 && peak < 9,
      `${label} exceeded the 9 ms workerd benchmark budget`,
    )
  }
} finally {
  await runtime.dispose()
}
