import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentGrid } from '@/components/AgentGrid'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import { ExplorerToolbar } from '@/components/ExplorerToolbar'
import { CategoryPills } from '@/components/CategoryPills'
import { Reveal } from '@/components/Reveal'
import { agentRepository } from '@/lib/agentRepository'
import { DEFAULT_QUERY, queryAgents, type CatalogQuery } from '@/lib/catalog'
import { canCloseAgentWithBack, useRoute } from '@/router/Router'
import { AGENT_CATEGORIES, type AgentManifest } from '@/types/agent'

const AGENT_PARAM = 'agent'
const CATEGORY_PARAM = 'category'

/** The hero's category links arrive as `?category=<tag>`. Unknown tags are ignored. */
function readCategoryParam(): CatalogQuery['category'] {
  const tag = new URLSearchParams(window.location.search).get(CATEGORY_PARAM)
  return AGENT_CATEGORIES.find((category) => category.tag === tag)?.tag ?? null
}

export function agentCloseUrl(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has(AGENT_PARAM)) return null
  url.searchParams.delete(AGENT_PARAM)
  return url.href
}

// Kept for the session so returning to the page shows the catalog at once.
let cachedAgents: AgentManifest[] | null = null
let cachedQuery: CatalogQuery = DEFAULT_QUERY

/**
 * The agent catalog: keyword filter, category pills, framework filter, sort,
 * the cards, and the detail view. Reads `catalog.json` only (invariant 3).
 * `/agents?agent=<id>` opens one agent; `/?agent=<id>` redirects here.
 */
export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentManifest[]>(
    () => cachedAgents ?? [],
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    cachedAgents ? 'ready' : 'loading',
  )
  const [query, setQuery] = useState<CatalogQuery>(() => {
    const category = readCategoryParam()
    return category ? { ...cachedQuery, category } : cachedQuery
  })
  const { location, go } = useRoute()
  const openId = new URLSearchParams(location.search).get(AGENT_PARAM)
  const closing = useRef(false)

  const patchQuery = useCallback((patch: Partial<CatalogQuery>) => {
    setQuery((current) => {
      cachedQuery = { ...current, ...patch }
      return cachedQuery
    })
  }, [])
  const resetQuery = useCallback(
    () => patchQuery({ ...DEFAULT_QUERY, sort: cachedQuery.sort }),
    [patchQuery],
  )

  useEffect(() => {
    let cancelled = false
    agentRepository
      .listAgents()
      .then((list) => {
        cachedAgents = list
        if (cancelled) return
        setAgents(list)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [])

  const openAgent = useCallback(
    (agent: AgentManifest) => {
      const url = new URL(window.location.href)
      const previousId = url.searchParams.get(AGENT_PARAM)
      if (previousId === agent.id) return

      const replace = url.searchParams.has(AGENT_PARAM)
      url.searchParams.set(AGENT_PARAM, agent.id)
      go(url.href, { replace })
      void agentRepository.recordView(agent.id).catch(() => {})
    },
    [go],
  )

  const closeAgent = useCallback(() => {
    if (closing.current) return
    const closeInPlace = () => {
      closing.current = false
      const url = agentCloseUrl(window.location.href)
      if (url) go(url, { replace: true })
    }
    if (!canCloseAgentWithBack(window.history.state)) {
      closeInPlace()
      return
    }

    closing.current = true
    // A previous entry can be replaced after this modal was opened.
    window.addEventListener('popstate', closeInPlace, { once: true })
    window.history.back()
  }, [go])

  const visible = useMemo(() => queryAgents(agents, query), [agents, query])
  const openedAgent = useMemo(
    () => agents.find((agent) => agent.id === openId) ?? null,
    [agents, openId],
  )

  return (
    <>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <Reveal as="section">
          <h1
            tabIndex={-1}
            className="mb-2 text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
          >
            Explore agents
          </h1>
          <p className="mb-6 max-w-2xl text-fg-muted">
            Discover AI assistants designed to perform specific jobs, from
            financial analysis to marketing and research.
            {agents.length > 0 && ` ${agents.length} available.`}
          </p>
          <CategoryPills
            category={query.category}
            onChange={(category) => patchQuery({ category })}
          />
          <ExplorerToolbar
            query={query}
            onChange={patchQuery}
            onReset={resetQuery}
            resultCount={visible.length}
          />
          <div className="mt-6">
            <AgentGrid
              agents={visible}
              status={status}
              onOpen={openAgent}
              onReset={resetQuery}
            />
          </div>
        </Reveal>
      </main>

      {openedAgent && (
        <AgentDetailModal
          key={openedAgent.id}
          agent={openedAgent}
          onClose={closeAgent}
        />
      )}
    </>
  )
}
