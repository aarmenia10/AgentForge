import {
  ACCOUNT_RESOURCE,
  CONNECTOR_ORIGIN,
  READ,
  SITE_ORIGIN,
  WRITE,
} from '../../../src/services/connectorConfig'
import { exchange, firestore, type Fetch } from './firebase'
import { active, changeGrants, readGrants } from './grants'
import {
  ABSOLUTE,
  IDLE,
  decode64url,
  pkceChallenge,
  tokenCodec,
  type KeyRing,
} from './tokens'

export const RESOURCE_METADATA =
  '/.well-known/oauth-protected-resource/account/mcp'
const AUTH_METADATA = '/.well-known/oauth-authorization-server'
const COOKIE = '__Host-al_flow'
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const CIMD_HOSTS = new Set(['claude.ai'])
const LOOPBACK =
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?\/callback$/
export const SETUP_MESSAGE = 'Account sign-in is not set up yet.'

export interface OAuthEnv {
  TOKEN_KEYS?: string
  FIREBASE_TOKEN_API_KEY?: string
  [key: string]: unknown
}
export interface OAuthOptions {
  fetch?: Fetch
  now?: () => number
  random?: (length: number) => Uint8Array
  metadataTimeout?: number
  project?: string
}
interface Registration {
  redirect_uris: string[]
  client_name: string
  application_type: 'native' | 'web'
}
interface Flow {
  client: string
  redirect: string
  host: string
  name: string
  challenge: string
  state: string
  scopes: string[]
  resource: string
  nonce: string
}
interface Handoff {
  redirect: string
  state: string
  nonce: string
  code?: string
}
interface GrantToken {
  uid: string
  grant: string
  gen: number
  epoch: number
  firebaseRefresh: string
  client: string
  resource: string
  scopes: string[]
  consent: number
}
interface Code extends GrantToken {
  redirect: string
  challenge: string
}
export interface Access {
  uid: string
  grant: string
  epoch: number
  scopes: string[]
  aud: string
  idToken: string
  idExpires: number
}

const noStore = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}
const siteCors = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
}
const json = (value: object, status = 200, headers?: HeadersInit) =>
  Response.json(value, { status, headers: { ...noStore, ...headers } })
const oauthError = (error: string, description?: string) =>
  json({ error, ...(description && { error_description: description }) }, 400)

function errorPage(message: string) {
  const safe = message.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  )
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>AgentLemon connection</title><main><h1>Could not connect to AgentLemon</h1><p>${safe}</p></main></html>`,
    {
      status: 400,
      headers: {
        ...noStore,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      },
    },
  )
}

function redirect(location: string, cookie?: string) {
  return new Response(null, {
    status: 302,
    headers: {
      ...noStore,
      Location: location,
      ...(cookie && { 'Set-Cookie': cookie }),
    },
  })
}

function flowCookie(value: string, age: number) {
  return `${COOKIE}=${value}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}`
}

function loopback(uri: string) {
  const match = LOOPBACK.exec(uri)
  return match && Number(match[2] ?? 80) <= 65535 && Number(match[2] ?? 80) > 0
    ? match[1]
    : null
}
const allowed = (uri: string) =>
  uri === CLAUDE_CALLBACK || loopback(uri) !== null
const clientName = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .trim()
        .slice(0, 60)
    : ''

// Read no more than the limit, including when an upstream omits Content-Length.
export async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
) {
  if (!body) throw new Error('Missing body')
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  let text = ''
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return text + decoder.decode()
      size += value.byteLength
      if (size > limit) throw new Error('Request too large')
      text += decoder.decode(value, { stream: true })
    }
  } catch (error) {
    void reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}

function mediaType(request: Request) {
  return request.headers
    .get('Content-Type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (mediaType(request) !== 'application/json')
    throw new Error('Expected JSON')
  const value = JSON.parse(await boundedText(request.body, 20000))
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected JSON object')
  return value
}

function requestedScopes(scope: string | null) {
  const requested = (scope ?? '').trim().split(/\s+/).filter(Boolean)
  if (
    requested.some((value) => ![READ, WRITE, 'offline_access'].includes(value))
  )
    return null
  return requested.includes(WRITE) ? [READ, WRITE] : [READ]
}

function envKeyRing(env: OAuthEnv): KeyRing {
  const ring = JSON.parse(env.TOKEN_KEYS!) as KeyRing
  if (ring.previous) {
    const slot = env[`TOKEN_KEYS_${ring.previous.kid}`]
    if (typeof slot === 'string') ring.keys[ring.previous.kid] = slot
  }
  return ring
}

function rotationHeaders(env: OAuthEnv): Record<string, string> {
  try {
    const ring = envKeyRing(env)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(ring.current)) return {}
    return {
      'X-AgentLemon-Token-Key': ring.current,
      ...(ring.previous &&
        Number.isSafeInteger(ring.previous.expires) && {
          'X-AgentLemon-Previous-Key-Expires': String(ring.previous.expires),
        }),
    }
  } catch {
    return {}
  }
}

export function createOAuth(options: OAuthOptions = {}) {
  const now = () => Math.floor((options.now ?? Date.now)() / 1000)
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init))
  const cache = new Map<string, { expires: number; data: Registration }>()

  async function metadata(id: string) {
    const url = new URL(id)
    if (
      url.protocol !== 'https:' ||
      !CIMD_HOSTS.has(url.host) ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname === '/'
    )
      throw new Error('The client metadata URL is not allowlisted.')
    const cached = cache.get(id)
    if (cached && cached.expires > now()) return cached.data
    const timeout = AbortSignal.timeout(options.metadataTimeout ?? 3000)
    const response = await fetcher(id, {
      redirect: 'error',
      signal: timeout,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok || Number(response.headers.get('Content-Length')) > 16384)
      throw new Error('Invalid client metadata')
    const data = JSON.parse(await boundedText(response.body, 16384))
    if (
      data.client_id !== id ||
      !Array.isArray(data.redirect_uris) ||
      (data.token_endpoint_auth_method !== undefined &&
        data.token_endpoint_auth_method !== 'none')
    )
      throw new Error('Invalid client metadata')
    const result: Registration = {
      redirect_uris: data.redirect_uris.filter(
        (uri: unknown) => typeof uri === 'string' && allowed(uri),
      ),
      client_name: clientName(data.client_name),
      application_type: data.application_type === 'native' ? 'native' : 'web',
    }
    if (cache.size >= 50) cache.delete(cache.keys().next().value!)
    cache.set(id, { expires: now() + 300, data: result })
    return result
  }

  function account(env: OAuthEnv) {
    if (!env.TOKEN_KEYS || !env.FIREBASE_TOKEN_API_KEY?.trim()) return null
    try {
      const codec = tokenCodec(envKeyRing(env), now, options.random)
      return { codec, key: env.FIREBASE_TOKEN_API_KEY }
    } catch {
      return null
    }
  }

  async function authorize(url: URL, codec: ReturnType<typeof tokenCodec>) {
    const { searchParams: params } = url
    const client = params.get('client_id') ?? ''
    const uri = params.get('redirect_uri') ?? ''
    if (!allowed(uri))
      return errorPage(`Redirect is not allowlisted: ${uri.slice(0, 240)}`)
    const cimd = client.startsWith('https://')
    const registration = cimd
      ? await metadata(client).catch(() => null)
      : await codec.open<Registration>('client', client)
    if (
      !registration?.redirect_uris.some(
        (candidate) =>
          candidate === uri ||
          (cimd &&
            loopback(uri) !== null &&
            loopback(candidate) === loopback(uri)),
      )
    )
      return errorPage('The client or its redirect could not be verified.')
    const state = params.get('state')
    const resource = params.get('resource') ?? ACCOUNT_RESOURCE
    const oauthRedirect = (error: string) => {
      const callback = new URL(uri)
      callback.searchParams.set('error', error)
      if (state && state.length <= 512)
        callback.searchParams.set('state', state)
      callback.searchParams.set('iss', CONNECTOR_ORIGIN)
      return redirect(callback.href)
    }
    if (
      [...new Set(params.keys())].some(
        (name) => params.getAll(name).length !== 1,
      )
    )
      return oauthRedirect('invalid_request')
    if (params.get('response_type') !== 'code')
      return oauthRedirect('unsupported_response_type')
    if (resource !== ACCOUNT_RESOURCE) return oauthRedirect('invalid_target')
    const challenge = params.get('code_challenge') ?? ''
    if (
      !state ||
      state.length > 512 ||
      params.get('code_challenge_method') !== 'S256' ||
      !isChallenge(challenge)
    )
      return oauthRedirect('invalid_request')
    const scopes = requestedScopes(params.get('scope'))
    if (!scopes) return oauthRedirect('invalid_scope')
    const nonce = codec.randomId(24)
    const flow: Flow = {
      client,
      redirect: uri,
      host: new URL(cimd ? client : uri).hostname,
      name: registration.client_name,
      challenge,
      state,
      scopes,
      resource,
      nonce,
    }
    const sealed = await codec.seal('req', flow, now() + 600)
    return redirect(
      `${SITE_ORIGIN}/connect#r=${sealed}`,
      flowCookie(nonce, 600),
    )
  }

  async function registration(
    request: Request,
    codec: ReturnType<typeof tokenCodec>,
  ) {
    const input = await readJson(request).catch(() => null)
    if (
      !input ||
      (input.token_endpoint_auth_method !== undefined &&
        input.token_endpoint_auth_method !== 'none')
    )
      return oauthError('invalid_client_metadata')
    const uris = input.redirect_uris
    if (
      !Array.isArray(uris) ||
      !uris.length ||
      uris.length > 10 ||
      uris.some((uri) => typeof uri !== 'string' || !allowed(uri))
    )
      return oauthError('invalid_redirect_uri')
    const client: Registration = {
      redirect_uris: [...new Set(uris)],
      client_name: clientName(input.client_name),
      application_type: input.application_type === 'native' ? 'native' : 'web',
    }
    return json(
      {
        ...client,
        client_id: await codec.seal('client', client, null),
        client_id_issued_at: now(),
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
    )
  }

  async function consent(
    request: Request,
    path: string,
    { codec, key }: NonNullable<ReturnType<typeof account>>,
  ) {
    if (request.headers.get('Origin') !== SITE_ORIGIN)
      return json({ error: 'Origin not allowed.' }, 403)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: siteCors })
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed.' }, 405, siteCors)
    const input = await readJson(request).catch(() => null)
    const flow =
      typeof input?.r === 'string'
        ? await codec.open<Flow>('req', input.r)
        : null
    const answer = (data: object, status = 200) => json(data, status, siteCors)
    if (!flow || !input)
      return answer(
        {
          error: 'This connection request expired. Start again in your AI app.',
        },
        400,
      )
    if (path === '/connect/describe')
      return answer({
        host: flow.host,
        name: flow.name,
        loopback: loopback(flow.redirect) !== null,
        scopes: flow.scopes,
      })

    const handoff: Handoff = {
      redirect: flow.redirect,
      state: flow.state,
      nonce: flow.nonce,
    }
    if (path === '/connect/complete') {
      if (
        typeof input.refresh_token !== 'string' ||
        !input.refresh_token ||
        !Array.isArray(input.scopes) ||
        !input.scopes.includes(READ) ||
        input.scopes.some((scope) => !flow.scopes.includes(scope))
      )
        return answer({ error: 'Invalid sign-in or permissions.' }, 400)
      const scopes = flow.scopes.filter((scope) =>
        (input.scopes as unknown[]).includes(scope),
      )
      const user = await exchange(fetcher, key, input.refresh_token).catch(
        () => null,
      )
      if (!user)
        return answer(
          { error: 'Firebase sign-in could not be verified. Sign in again.' },
          400,
        )
      const consentTime = now()
      const db = firestore(fetcher, user.idToken, options.project)
      const grant = codec.randomId(16)
      const epoch = await changeGrants(db, user.uid, (state) => {
        state.grants = Object.fromEntries(
          Object.entries(state.grants).filter(([, item]) =>
            active(item, consentTime),
          ),
        )
        if (Object.keys(state.grants).length >= 20)
          return { write: false, result: null }
        const at = new Date(consentTime * 1000)
        state.grants[grant] = {
          gen: 0,
          app: flow.host,
          name: flow.name,
          scopes: scopes.join(' '),
          created: at,
          refreshed: at,
        }
        return { write: true, result: state.epoch }
      })
      if (epoch === null)
        return answer(
          {
            error:
              'Disconnect an app in Settings before adding another connection.',
          },
          409,
        )
      const code: Code = {
        uid: user.uid,
        gen: 0,
        grant,
        epoch,
        client: flow.client,
        resource: flow.resource,
        scopes,
        consent: consentTime,
        redirect: flow.redirect,
        challenge: flow.challenge,
        firebaseRefresh: user.refreshToken,
      }
      handoff.code = await codec.seal('code', code, now() + 60)
    }
    const h = await codec.seal('handoff', handoff, now() + 120)
    return answer({ finish: `${CONNECTOR_ORIGIN}/authorize/finish?h=${h}` })
  }

  async function finish(
    request: Request,
    url: URL,
    codec: ReturnType<typeof tokenCodec>,
  ) {
    const handoff = await codec.open<Handoff>(
      'handoff',
      url.searchParams.get('h'),
    )
    const nonce = request.headers
      .get('Cookie')
      ?.split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1)
    if (!handoff || nonce !== handoff.nonce)
      return errorPage(
        'This connection request expired or started in another browser.',
      )
    const callback = new URL(handoff.redirect)
    if (handoff.code) callback.searchParams.set('code', handoff.code)
    else callback.searchParams.set('error', 'access_denied')
    callback.searchParams.set('state', handoff.state)
    callback.searchParams.set('iss', CONNECTOR_ORIGIN)
    return redirect(callback.href, flowCookie('', 0))
  }

  async function token(
    request: Request,
    { codec, key }: NonNullable<ReturnType<typeof account>>,
  ) {
    if (mediaType(request) !== 'application/x-www-form-urlencoded')
      return oauthError('invalid_request')
    const params = new URLSearchParams(await boundedText(request.body, 24000))
    if (
      [...new Set(params.keys())].some(
        (name) => params.getAll(name).length !== 1,
      )
    )
      return oauthError('invalid_request')
    const type = params.get('grant_type')
    const invalid = () => oauthError('invalid_grant')
    try {
      let previous: GrantToken | null
      if (type === 'authorization_code') {
        const code = await codec.open<Code>('code', params.get('code'))
        const verifier = params.get('code_verifier') ?? ''
        if (
          !code ||
          code.redirect !== params.get('redirect_uri') ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
          (await pkceChallenge(verifier)) !== code.challenge
        )
          return invalid()
        previous = code
      } else if (type === 'refresh_token') {
        previous = await codec.open<GrantToken>(
          'rt',
          params.get('refresh_token'),
        )
      } else return oauthError('unsupported_grant_type')
      if (
        !previous ||
        previous.client !== params.get('client_id') ||
        previous.resource !== ACCOUNT_RESOURCE ||
        (params.get('resource') ?? ACCOUNT_RESOURCE) !== previous.resource ||
        previous.consent + ABSOLUTE <= now()
      )
        return invalid()
      const old = previous
      const user = await exchange(fetcher, key, old.firebaseRefresh)
      if (user.uid !== old.uid) return invalid()
      const at = now()
      const exp = Math.min(user.expires - 300, old.consent + ABSOLUTE)
      if (exp <= at) return invalid()
      const db = firestore(fetcher, user.idToken, options.project)
      const ok = await changeGrants(db, old.uid, (state) => {
        const grant = state.grants[old.grant]
        if (state.epoch !== old.epoch || !active(grant, at))
          return { write: false, result: false }
        if (grant.gen > old.gen) {
          delete state.grants[old.grant]
          return { write: true, result: false }
        }
        if (grant.gen !== old.gen) return { write: false, result: false }
        state.grants[old.grant] = {
          ...grant,
          gen: old.gen + 1,
          refreshed: new Date(at * 1000),
        }
        return { write: true, result: true }
      })
      if (!ok) return invalid()
      const next: GrantToken = {
        uid: old.uid,
        grant: old.grant,
        gen: old.gen + 1,
        epoch: old.epoch,
        firebaseRefresh: user.refreshToken,
        client: old.client,
        resource: old.resource,
        scopes: old.scopes,
        consent: old.consent,
      }
      const access: Access = {
        uid: old.uid,
        grant: old.grant,
        epoch: old.epoch,
        scopes: old.scopes,
        aud: ACCOUNT_RESOURCE,
        idToken: user.idToken,
        idExpires: user.expires,
      }
      const [access_token, refresh_token] = await Promise.all([
        codec.seal('at', access, exp),
        codec.seal('rt', next, Math.min(at + IDLE, old.consent + ABSOLUTE)),
      ])
      return json({
        access_token,
        refresh_token,
        expires_in: exp - now(),
        token_type: 'Bearer',
        scope: old.scopes.join(' '),
      })
    } catch {
      return invalid()
    }
  }

  return {
    account,
    async authenticate(
      header: string | null,
      codec: ReturnType<typeof tokenCodec>,
    ) {
      const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(header ?? '')?.[1]
      const access = bearer ? await codec.open<Access>('at', bearer) : null
      if (
        !access ||
        access.aud !== ACCOUNT_RESOURCE ||
        access.idExpires <= now() ||
        !access.scopes.includes(READ)
      )
        return null
      const db = firestore(fetcher, access.idToken, options.project)
      const { data } = await readGrants(db, access.uid)
      const grant = data.grants[access.grant]
      return data.epoch === access.epoch &&
        active(grant, now()) &&
        grant.gen >= 1
        ? { access, db }
        : null
    },
    async handle(
      request: Request,
      url: URL,
      env: OAuthEnv,
    ): Promise<Response | null> {
      const path = url.pathname
      if (
        request.method === 'GET' &&
        [RESOURCE_METADATA, '/.well-known/oauth-protected-resource'].includes(
          path,
        )
      )
        return json({
          resource: ACCOUNT_RESOURCE,
          authorization_servers: [CONNECTOR_ORIGIN],
          scopes_supported: [READ, WRITE],
          bearer_methods_supported: ['header'],
        })
      if (request.method === 'GET' && path === AUTH_METADATA)
        return json(
          {
            issuer: CONNECTOR_ORIGIN,
            authorization_endpoint: `${CONNECTOR_ORIGIN}/authorize`,
            token_endpoint: `${CONNECTOR_ORIGIN}/token`,
            registration_endpoint: `${CONNECTOR_ORIGIN}/register`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            client_id_metadata_document_supported: true,
            authorization_response_iss_parameter_supported: true,
            scopes_supported: [READ, WRITE, 'offline_access'],
          },
          200,
          rotationHeaders(env),
        )

      const isConsent = [
        '/connect/describe',
        '/connect/complete',
        '/connect/deny',
      ].includes(path)
      if (
        !isConsent &&
        !['/authorize', '/authorize/finish', '/register', '/token'].includes(
          path,
        )
      )
        return null
      if (
        isConsent &&
        request.method === 'OPTIONS' &&
        request.headers.get('Origin') === SITE_ORIGIN
      )
        return new Response(null, { status: 204, headers: siteCors })
      const config = account(env)
      if (!config)
        return json(
          { error: SETUP_MESSAGE },
          503,
          isConsent && request.headers.get('Origin') === SITE_ORIGIN
            ? siteCors
            : undefined,
        )
      try {
        if (isConsent) return await consent(request, path, config)
        if (request.method === 'GET' && path === '/authorize')
          return await authorize(url, config.codec)
        if (request.method === 'GET' && path === '/authorize/finish')
          return await finish(request, url, config.codec)
        if (request.method === 'POST' && path === '/register')
          return await registration(request, config.codec)
        if (request.method === 'POST' && path === '/token')
          return await token(request, config)
        return json({ error: 'Method not allowed.' }, 405)
      } catch {
        if (isConsent)
          return json(
            { error: 'Could not complete the connection. Try again.' },
            503,
            request.headers.get('Origin') === SITE_ORIGIN
              ? siteCors
              : undefined,
          )
        if (path.startsWith('/authorize'))
          return errorPage('Could not complete the connection. Try again.')
        return oauthError('invalid_request')
      }
    },
    challenge(scope: string, missing = true) {
      const error = missing ? 'invalid_token' : 'insufficient_scope'
      return json({ error }, missing ? 401 : 403, {
        'WWW-Authenticate': `Bearer error="${error}", resource_metadata="${CONNECTOR_ORIGIN}${RESOURCE_METADATA}", scope="${scope}"`,
      })
    },
  }
}

function isChallenge(value: string) {
  try {
    return value.length === 43 && decode64url(value).length === 32
  } catch {
    return false
  }
}
