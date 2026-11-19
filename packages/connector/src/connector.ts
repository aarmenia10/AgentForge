/**
 * AgentLemon remote connector: the request handler.
 * The Worker entry point is worker.ts, which may export nothing but handlers.
 *
 *   POST /mcp   MCP over Streamable HTTP, stateless, JSON responses
 *   GET  /      a short human-readable page
 *
 * Public and read-only. It stores nothing and logs no request content.
 * See README section 7.6 for the rules this file must keep.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { parsePublicCatalog } from '../../../src/lib/manifestSchema'
import type { AgentManifest } from '../../../src/types/agent'
import {
  parsePublicSkillIndex,
  parsePublicSkillVersion,
  skillVersionPath,
} from '../../../src/lib/skillSchema'
import { READ, SITE_ORIGIN, WRITE } from '../../../src/services/connectorConfig'
import bundledCatalog from '../../../public/catalog.json'
import { createConnectorServer } from './server'
import { hostedSkillReader } from '../../mcp-server/src/skills'
import { resolveAgent, versionUrl } from '../../mcp-server/src/versions'
import type { OriginApp } from '../../../src/lib/portability'
import {
  accountToolNames,
  runAccountTool,
  writeToolNames,
} from './accountTools'
import {
  boundedText,
  createOAuth,
  SETUP_MESSAGE,
  type OAuthEnv,
  type OAuthOptions,
} from './oauth'
import { FirestoreError } from './firebase'

export const CATALOG_URL = `${SITE_ORIGIN}/catalog.json`
export const SITE_URL = SITE_ORIGIN
const CACHE_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
  'Access-Control-Max-Age': '86400',
}

export interface ConnectorOptions extends OAuthOptions {
  /** Injected in tests. Defaults to the global fetch. */
  fetchCatalog?: (url: string) => Promise<Response>
  now?: () => number
}

/** Builds the Worker's fetch handler. One catalog cache per isolate. */
export function createConnector(options: ConnectorOptions = {}) {
  const fetchCatalog =
    options.fetchCatalog ??
    ((url: string) =>
      fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }))
  const now = options.now ?? Date.now
  const oauth = createOAuth(options)
  // The snapshot bundled at deploy time is the fallback of last resort.
  const readSkill = hostedSkillReader(CATALOG_URL, fetchCatalog, now)
  const snapshot = parsePublicCatalog(bundledCatalog)
  let skillIndex:
    { value: ReturnType<typeof parsePublicSkillIndex>; at: number } | undefined
  let cached:
    | { agents: AgentManifest[]; at: number; source: 'live' | 'snapshot' }
    | undefined

  async function loadCatalog() {
    if (cached && now() - cached.at < CACHE_MS) return cached
    try {
      const response = await fetchCatalog(CATALOG_URL)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      cached = {
        agents: parsePublicCatalog(await response.json()),
        at: now(),
        source: 'live',
      }
    } catch {
      // Keep serving the last good live copy if we have one; else the snapshot.
      // Either way, retry the live catalog after the cache window.
      cached = {
        agents: cached?.source === 'live' ? cached.agents : snapshot,
        at: now(),
        source: cached?.source === 'live' ? 'live' : 'snapshot',
      }
    }
    return cached
  }

  const withCors = (response: Response) => {
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value)
    return new Response(response.body, { status: response.status, headers })
  }

  async function publicSkill(id: string, version?: string) {
    async function read(path: string) {
      const response = await fetchCatalog(new URL(path, CATALOG_URL).href)
      if (!response.ok) throw new Error('Skill is unavailable.')
      return response.json()
    }
    if (!skillIndex || now() - skillIndex.at >= CACHE_MS)
      skillIndex = {
        value: parsePublicSkillIndex(await read('skills.json')),
        at: now(),
      }
    const entry = skillIndex.value.skills.find((skill) => skill.id === id)
    if (!entry) return null
    const pin = version ?? entry.version
    const skill = parsePublicSkillVersion(
      await read(skillVersionPath(id, pin)),
      id,
      pin,
    )
    return skill.author.uid === entry.author.uid ? skill : null
  }

  let cachedOrigins:
    | {
        origins: Record<string, OriginApp>
        at: number
      }
    | undefined

  async function loadOrigins(): Promise<Record<string, OriginApp>> {
    if (cachedOrigins && now() - cachedOrigins.at < CACHE_MS)
      return cachedOrigins.origins
    try {
      const response = await fetchCatalog(
        new URL('origins.json', CATALOG_URL).href,
      )
      if (response.ok) {
        cachedOrigins = {
          origins: (await response.json()) as Record<string, OriginApp>,
          at: now(),
        }
      } else {
        cachedOrigins = {
          origins: cachedOrigins?.origins ?? {},
          at: now(),
        }
      }
    } catch {
      cachedOrigins = {
        origins: cachedOrigins?.origins ?? {},
        at: now(),
      }
    }
    return cachedOrigins.origins
  }

  return async function handle(
    request: Request,
    env: OAuthEnv = {},
  ): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/mcp' && url.pathname !== '/account/mcp') {
      const response = await oauth.handle(request, url, env)
      if (response)
        return url.pathname.startsWith('/connect/')
          ? response
          : withCors(response)
    }
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS })

    const accountPath = url.pathname === '/account/mcp'
    if (url.pathname === '/mcp' || accountPath) {
      const failure = (status: number, message: string, code = -32000) =>
        withCors(
          Response.json(
            {
              jsonrpc: '2.0',
              error: { code, message },
              id: null,
            },
            { status, headers: { 'Cache-Control': 'no-store' } },
          ),
        )
      const oauthConfig = accountPath ? oauth.account(env) : null
      if (accountPath && !oauthConfig) return failure(503, SETUP_MESSAGE)
      if (request.method !== 'POST')
        // Stateless: there is no session to stream to or to delete.
        return withCors(
          Response.json(
            {
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: `Method not allowed. POST MCP requests to ${url.pathname}.`,
              },
              id: null,
            },
            { status: 405, headers: { Allow: 'POST, OPTIONS' } },
          ),
        )
      let parsedBody: unknown
      let authorization: Awaited<ReturnType<typeof oauth.authenticate>> = null
      if (oauthConfig) {
        try {
          // A 200 KiB text skill can grow when represented as escaped JSON.
          parsedBody = JSON.parse(
            await boundedText(request.body, 2 * 1024 * 1024),
          )
        } catch {
          return failure(400, 'Invalid JSON.', -32700)
        }
        const calls = (
          Array.isArray(parsedBody) ? parsedBody : [parsedBody]
        ).flatMap((value) =>
          value?.method === 'tools/call' &&
          accountToolNames.has(value?.params?.name)
            ? [value.params.name as string]
            : [],
        )
        if (calls.length) {
          try {
            authorization = await oauth.authenticate(
              request.headers.get('Authorization'),
              oauthConfig.codec,
            )
          } catch (error) {
            if (!(
              error instanceof FirestoreError &&
              [401, 403].includes(error.status)
            ))
              return failure(503, 'Could not verify the connection. Try again.')
          }
          if (!authorization)
            return withCors(oauth.challenge(`${READ} ${WRITE}`))
          if (
            calls.some((name) => writeToolNames.has(name)) &&
            !authorization.access.scopes.includes(WRITE)
          )
            return withCors(oauth.challenge(`${READ} ${WRITE}`, false))
        }
      }
      const { agents } = await loadCatalog()
      const resolve = (selector: string) =>
        resolveAgent(agents, selector, async (id, version) => {
          const response = await fetchCatalog(
            versionUrl(CATALOG_URL, id, version),
          )
          if (!response.ok)
            throw new Error(`Version request failed: HTTP ${response.status}`)
          return response.json()
        })
      const server = createConnectorServer(
        agents,
        resolve,
        readSkill,
        accountPath
          ? (name, args) => {
              if (!authorization)
                throw new Error('Account sign-in is required.')
              return runAccountTool(name, args, {
                ...authorization,
                now,
                publicAgent: (id, version) =>
                  agents.some((agent) => agent.id === id)
                    ? resolve(version ? `${id}@${version}` : id)
                    : Promise.resolve(null),
                publicSkill,
                publicOrigins: loadOrigins,
              })
            }
          : undefined,
        loadOrigins,
      )
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await server.connect(transport)
      try {
        return withCors(
          await transport.handleRequest(
            request,
            accountPath ? { parsedBody } : undefined,
          ),
        )
      } finally {
        await server.close().catch(() => {})
      }
    }

    if (url.pathname === '/' && request.method === 'GET') {
      const { agents, source } = await loadCatalog()
      return new Response(
        [
          'AgentLemon remote connector',
          '',
          'This is an MCP server for AI apps, not a web page.',
          `Add ${url.origin}/mcp as a custom connector in your AI app's settings.`,
          '',
          `Agents available: ${agents.length} (${source} catalog)`,
          `Browse them: ${SITE_URL}`,
          '',
        ].join('\n'),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS } },
      )
    }

    return withCors(new Response('Not found', { status: 404 }))
  }
}
