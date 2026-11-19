import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

const origin = 'https://agentlemon-connector.lesslimit.workers.dev'
const slot = (kid) => `TOKEN_KEYS_${kid}`
const slotPattern = /^TOKEN_KEYS_k[0-9]+_[a-f0-9]{12}$/

function wrangler(args, input) {
  // A secret only crosses the subprocess stdin pipe. Do not forward Wrangler
  // output from mutations, or dump subprocess errors that could include input.
  const result = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'secret', ...args],
    {
      input,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  )
  if (result.status !== 0)
    throw new Error(
      `Wrangler secret ${args[0]} failed. Check the Worker and Cloudflare credentials.`,
    )
  return result.stdout
}

async function state() {
  const response = await fetch(
    `${origin}/.well-known/oauth-authorization-server`,
    {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    },
  )
  if (!response.ok)
    throw new Error(
      'Deploy the connector with OAuth metadata before managing keys.',
    )
  return {
    current: response.headers.get('X-AgentLemon-Token-Key'),
    previousExpires: Number(
      response.headers.get('X-AgentLemon-Previous-Key-Expires') ?? 0,
    ),
  }
}

async function run(mode) {
  if (!['initialize', 'rotate', 'retire', 'emergency'].includes(mode))
    throw new Error('Unknown key operation.')
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    process.env[name] =
      (process.env[name] ?? '')
        .split(/\r?\n/)
        .find((line) => line.trim())
        ?.trim() ?? ''
    if (!process.env[name])
      throw new Error(`Set the existing repository secret ${name}.`)
  }
  const secrets = new Set(
    JSON.parse(wrangler(['list', '--format', 'json'])).map(({ name }) => name),
  )
  const { current, previousExpires } = await state()
  const now = Math.floor(Date.now() / 1000)
  if (mode === 'initialize' && (current || secrets.has('TOKEN_KEYS')))
    throw new Error('TOKEN_KEYS already exists. Choose rotate or emergency.')
  if (
    (mode === 'rotate' || mode === 'retire') &&
    (!current || !secrets.has('TOKEN_KEYS'))
  )
    throw new Error('Initialize the keys first.')
  if (mode === 'rotate' && !secrets.has(slot(current)))
    throw new Error(
      'The existing key was provisioned outside this workflow. Use emergency to replace it.',
    )
  if (['rotate', 'retire'].includes(mode) && previousExpires > now)
    throw new Error('The current 35-day overlap is still active.')

  let active = current
  if (mode !== 'retire') {
    const kid = `k${now}_${randomBytes(6).toString('hex')}`
    const key = randomBytes(32).toString('base64')
    const previous =
      mode === 'rotate'
        ? { kid: current, expires: now + 35 * 86400 }
        : undefined
    // Publish the copy first. The Worker ignores every slot except the one
    // named in TOKEN_KEYS, so an interrupted upload cannot activate a key.
    wrangler(['put', slot(kid)], key)
    wrangler(
      ['put', 'TOKEN_KEYS'],
      JSON.stringify({ current: kid, keys: { [kid]: key }, previous }),
    )
    active = kid
  }

  // Confirm Cloudflare serves the intended version before removing anything.
  let propagated = false
  for (let attempt = 0; attempt < 12; attempt++) {
    if ((await state()).current === active) {
      propagated = true
      break
    }
    await setTimeout(2000)
  }
  if (!propagated)
    throw new Error(
      'The key deployment has not propagated. Recheck before removing old bindings.',
    )
  for (const name of secrets) {
    if (
      slotPattern.test(name) &&
      name !== slot(active) &&
      !(mode === 'rotate' && name === slot(current))
    )
      wrangler(['delete', name])
  }
  console.log(`Connector key operation completed (${mode}).`)
  if (mode === 'rotate')
    console.log('Run retire after 35 days to remove the expired key binding.')
}

try {
  await run(process.argv[2])
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? 'Wrangler returned an invalid secret list.'
      : error.message,
  )
  process.exitCode = 1
}
