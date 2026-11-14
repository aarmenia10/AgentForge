import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgentGrid } from '@/components/AgentGrid'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import { ExplorerToolbar } from '@/components/ExplorerToolbar'
import { ConnectorCard } from '@/components/ConnectorCard'
import { Hero } from '@/components/Hero'
import { agentRepository } from '@/lib/agentRepository'
import { queryAgents, type CatalogQuery } from '@/lib/catalog'
import { useRoute } from '@/router/Router'
import type { AgentManifest } from '@/types/agent'

const AGENT_PARAM = 'agent'

function readAgentParam(): string | null {
  return new URLSearchParams(window.location.search).get(AGENT_PARAM)
}

/** Mirrors the open agent into `?agent=<id>` so detail views are shareable. */
function writeAgentParam(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set(AGENT_PARAM, id)
  else url.searchParams.delete(AGENT_PARAM)
  window.history.pushState(null, '', url)
}

// Kept for the session so returning to the home page shows the catalog at once.
let cachedAgents: AgentManifest[] | null = null

interface HomePageProps {
  query: CatalogQuery
  patchQuery: (patch: Partial<CatalogQuery>) => void
  resetQuery: () => void
}

export function HomePage({ query, patchQuery, resetQuery }: HomePageProps) {
  const [agents, setAgents] = useState<AgentManifest[]>(
    () => cachedAgents ?? [],
  )
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    cachedAgents ? 'ready' : 'loading',
  )
  const [openId, setOpenId] = useState<string | null>(readAgentParam)
  const { location } = useRoute()

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

  // Back and forward (and router navigation such as the logo link) can add or
  // remove `?agent=<id>`; the URL is the source of truth for the open agent.
  useEffect(() => {
    setOpenId(readAgentParam())
  }, [location.key])

  const openAgent = useCallback((agent: AgentManifest) => {
    setOpenId(agent.id)
    writeAgentParam(agent.id)
    void agentRepository.recordView(agent.id).catch(() => {})
  }, [])

  const closeAgent = useCallback(() => {
    setOpenId(null)
    writeAgentParam(null)
  }, [])

  const visible = useMemo(() => queryAgents(agents, query), [agents, query])
  const openedAgent = useMemo(
    () => agents.find((agent) => agent.id === openId) ?? null,
    [agents, openId],
  )

  return (
    <>
      <main>
        <Hero
          category={query.category}
          onCategoryChange={(category) => patchQuery({ category })}
          agentCount={agents.length}
        />

        <div
          id="connect"
          className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-12 sm:px-6"
        >
          <ConnectorCard />
        </div>

        <section
          id="explore"
          className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 sm:px-6"
        >
          <h2 className="mb-4 text-xl font-semibold tracking-tight">
            Explore agents
          </h2>
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
        </section>
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
