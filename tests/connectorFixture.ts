import {
  ACCOUNT_RESOURCE,
  CONNECTOR_ORIGIN,
  READ,
  SITE_ORIGIN,
  WRITE,
} from '../src/services/connectorConfig'
import {
  createConnector,
  type ConnectorOptions,
} from '../packages/connector/src/connector'
import { base64url, pkceChallenge } from '../packages/connector/src/tokens'
import type { OAuthEnv } from '../packages/connector/src/oauth'
import { SEED_AGENTS } from '../src/data/seedAgents'

export const ORIGIN = CONNECTOR_ORIGIN
export const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
export const VERIFIER = 'A'.repeat(43)
export const TEST_RING = {
  current: 'first',
  keys: { first: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=' },
}
export const TEST_ENV = {
  TOKEN_KEYS: JSON.stringify(TEST_RING),
  FIREBASE_TOKEN_API_KEY: 'test-key',
}
export const START = 1_800_000_000_000
export const NEEDS_AUTH = `Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/account/mcp", scope="${READ} ${WRITE}"`

export const rpc = (name: string, args: object = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
})
export const rpcHeaders = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}
export const idToken = (uid: string, now: number, verified = true) =>
  `test.${base64url(new TextEncoder().encode(JSON.stringify({ sub: uid, exp: Math.floor(now / 1000) + 3600, email_verified: verified })))}.test`

export function connectorClient(
  options: ConnectorOptions = {},
  env: OAuthEnv = TEST_ENV,
) {
  const worker = createConnector({
    fetchCatalog: async () => Response.json(SEED_AGENTS),
    ...options,
  })
  const request = (path: string, init?: RequestInit) =>
    worker(new Request(new URL(path, ORIGIN), init), env)
  const send = (body: object, path = '/account/mcp', access?: string) =>
    request(path, {
      method: 'POST',
      headers: {
        ...rpcHeaders,
        ...(access && { Authorization: `Bearer ${access}` }),
      },
      body: JSON.stringify(body),
    })
  const json = (path: string, fields: object, origin?: string) =>
    request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(origin && { Origin: origin }),
      },
      body: JSON.stringify(fields),
    })
  const consent = (action: string, fields: object, origin = SITE_ORIGIN) =>
    json(`/connect/${action}`, fields, origin)
  async function register(redirect = CALLBACK) {
    const response = await json('/register', {
      redirect_uris: [redirect],
      client_name: 'Test app',
      application_type: 'native',
    })
    if (response.status !== 201)
      throw new Error(`Registration failed ${response.status}`)
    return (await response.json()).client_id as string
  }
  async function authorize(
    client: string,
    overrides: Record<string, string | null> = {},
  ) {
    const url = new URL('/authorize', ORIGIN)
    const args = {
      client_id: client,
      redirect_uri: CALLBACK,
      response_type: 'code',
      code_challenge: await pkceChallenge(VERIFIER),
      code_challenge_method: 'S256',
      state: 'state from client',
      scope: `${READ} ${WRITE} offline_access`,
      resource: ACCOUNT_RESOURCE,
      ...overrides,
    }
    Object.entries(args).forEach(
      ([key, value]) => value !== null && url.searchParams.set(key, value),
    )
    return request(url.href)
  }
  const form = (fields: Record<string, string>) =>
    request('/token', { method: 'POST', body: new URLSearchParams(fields) })
  const redeem = (
    client: string,
    code: string,
    overrides?: Record<string, string>,
  ) =>
    form({
      grant_type: 'authorization_code',
      client_id: client,
      code,
      code_verifier: VERIFIER,
      redirect_uri: CALLBACK,
      ...overrides,
    })
  const refresh = (client: string, refresh_token: string) =>
    form({ grant_type: 'refresh_token', client_id: client, refresh_token })
  async function begin(client?: string) {
    client ??= await register()
    const response = await authorize(client)
    const location = response.headers.get('Location')
    const cookie = response.headers.get('Set-Cookie')
    if (response.status !== 302 || !location || !cookie)
      throw new Error('Could not authorize.')
    return {
      client,
      response,
      r: new URLSearchParams(new URL(location).hash.slice(1)).get('r')!,
      cookie: cookie.split(';')[0],
    }
  }
  async function complete(
    r: string,
    refresh_token = 'firebase-initial',
    scopes = [READ, WRITE],
  ) {
    const response = await consent('complete', { r, refresh_token, scopes })
    if (!response.ok)
      throw new Error(
        `Consent failed ${response.status}: ${await response.text()}`,
      )
    return (await response.json()).finish as string
  }
  const finish = (url: string, cookie?: string) =>
    request(url, { headers: cookie ? { Cookie: cookie } : {} })
  async function mintCode(token?: string, scopes?: string[]) {
    const { client, r, cookie } = await begin()
    const finished = await finish(await complete(r, token, scopes), cookie)
    if (finished.status !== 302) throw new Error('Could not finish.')
    return {
      client,
      code: new URL(finished.headers.get('Location')!).searchParams.get(
        'code',
      )!,
    }
  }
  async function connect(token?: string, scopes?: string[]) {
    const { client, code } = await mintCode(token, scopes)
    const redeemed = await redeem(client, code)
    if (!redeemed.ok)
      throw new Error(`Could not redeem: ${await redeemed.text()}`)
    return { ...(await redeemed.json()), client } as {
      client: string
      access_token: string
      refresh_token: string
      expires_in: number
      scope: string
    }
  }
  return {
    request,
    json,
    send,
    register,
    authorize,
    begin,
    consent,
    finish,
    complete,
    mintCode,
    redeem,
    refresh,
    connect,
  }
}

export async function toolBody(response: Response) {
  const payload = await response.json()
  if (payload.result?.isError) throw new Error(payload.result.content[0].text)
  return JSON.parse(payload.result.content[0].text)
}
