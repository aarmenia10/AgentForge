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
import assert from 'node:assert/strict'
import {
  FIRESTORE_ORIGIN,
  TOKEN_ENDPOINT,
} from '../packages/connector/src/firebase'

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

/**
 * A connector signed in as "alice" against an in-memory Firestore REST fake.
 * Moved from connector-auth.test.ts so other tests can save and read back
 * through the real OAuth, account tools, and Firestore value encoding.
 */
export function accountFixture(verified = true) {
  let time = START
  let version = 0
  let exchanges = 0
  let entropy = 0
  const exchangeInputs: string[] = []
  const calls: string[] = []
  const documents = new Map<string, { fields: object; updateTime: string }>()
  const projectRoot = 'projects/agentforge-b10db/databases/(default)/documents/'
  const grantPath = projectRoot + 'connector_grants/alice'
  const profileFields = {
    handle: { stringValue: 'alice' },
    display_name: { stringValue: 'Alice' },
  }
  const client = connectorClient({
    now: () => time,
    random: (length) =>
      Uint8Array.from({ length }, (_, index) => (index + ++entropy) % 256),
    async fetch(url, init) {
      if (url.startsWith(TOKEN_ENDPOINT)) {
        const old = new URLSearchParams(init?.body as URLSearchParams).get(
          'refresh_token',
        )!
        exchangeInputs.push(old)
        if (old === 'bad-token')
          return Response.json(
            {
              error: {
                message: 'INVALID_REFRESH_TOKEN',
                status: 'INVALID_ARGUMENT',
              },
            },
            { status: 400 },
          )
        return Response.json({
          id_token: idToken('alice', time, verified),
          refresh_token: `firebase-${++exchanges}`,
          user_id: 'alice',
        })
      }
      assert.ok(url.startsWith(FIRESTORE_ORIGIN))
      assert.match(
        new Headers(init?.headers).get('Authorization') ?? '',
        /^Bearer test\./,
      )
      const path = url.slice(`${FIRESTORE_ORIGIN}/v1/`.length)
      if (path.endsWith(':commit')) {
        calls.push('commit')
        const {
          writes: [{ currentDocument, update }],
        } = JSON.parse(init!.body as string)
        const existing = documents.get(update.name)
        if (
          existing
            ? existing.updateTime !== currentDocument.updateTime
            : currentDocument.exists !== false
        )
          return Response.json(
            {
              error: {
                status:
                  existing && currentDocument.exists === false
                    ? 'ALREADY_EXISTS'
                    : 'FAILED_PRECONDITION',
              },
            },
            { status: 409 },
          )
        documents.set(update.name, {
          fields: update.fields,
          updateTime: String(++version),
        })
        return Response.json({})
      }
      if (path.endsWith(':runQuery')) {
        calls.push('query')
        const { structuredQuery: query } = JSON.parse(init!.body as string)
        assert.ok(
          query.select.fields.some(
            ({ fieldPath }: { fieldPath: string }) =>
              fieldPath === 'review_status',
          ),
        )
        assert.equal(query.where.fieldFilter.value.stringValue, 'alice')
        return Response.json([])
      }
      calls.push(path.slice(projectRoot.length))
      if (path === projectRoot + 'users/alice')
        return Response.json({ fields: profileFields })
      const doc = documents.get(path)
      return doc ? Response.json(doc) : Response.json({}, { status: 404 })
    },
  })
  return {
    ...client,
    calls,
    exchangeInputs,
    documents,
    grantPath,
    now: () => time,
    advance: (seconds: number) => {
      time += seconds * 1000
    },
    projectRoot,
  }
}
