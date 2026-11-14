/**
 * AgentForge remote connector: the request handler.
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
import bundledCatalog from '../../../public/catalog.json'
import { createConnectorServer } from './server'

export const CATALOG_URL = 'https://agentforge-b10db.web.app/catalog.json'
export const SITE_URL = 'https://agentforge-b10db.web.app'
const CACHE_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

export interface ConnectorOptions {
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
  // The snapshot bundled at deploy time is the fallback of last resort.
  const snapshot = parsePublicCatalog(bundledCatalog)
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

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS })

    if (url.pathname === '/mcp') {
      if (request.method !== 'POST')
        // Stateless: there is no session to stream to or to delete.
        return withCors(
          Response.json(
            {
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'Method not allowed. POST MCP requests to /mcp.',
              },
              id: null,
            },
            { status: 405, headers: { Allow: 'POST, OPTIONS' } },
          ),
        )
      const { agents } = await loadCatalog()
      const server = createConnectorServer(agents)
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      await server.connect(transport)
      try {
        return withCors(await transport.handleRequest(request))
      } finally {
        await server.close().catch(() => {})
      }
    }

    if (url.pathname === '/' && request.method === 'GET') {
      const { agents, source } = await loadCatalog()
      return new Response(
        [
          'AgentForge remote connector',
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
