import { useCallback, useEffect, useMemo, useState } from 'react'
import { AgentGrid } from './components/AgentGrid'
import { AgentDetailModal } from './components/detail/AgentDetailModal'
import { ExplorerToolbar } from './components/ExplorerToolbar'
import { Hero } from './components/Hero'
import { TopNav } from './components/TopNav'
import { GitHubIcon } from './components/ui'
import { agentRepository } from './lib/agentRepository'
import { DEFAULT_QUERY, queryAgents, type CatalogQuery } from './lib/catalog'
import type { AgentManifest } from './types/agent'

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

export default function App() {
  const [agents, setAgents] = useState<AgentManifest[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState<CatalogQuery>(DEFAULT_QUERY)
  const [openId, setOpenId] = useState<string | null>(readAgentParam)

  useEffect(() => {
    let cancelled = false
    agentRepository
      .listAgents()
      .then((list) => {
        if (cancelled) return
        setAgents(list)
        setStatus('ready')
      })
      .catch(() => !cancelled && setStatus('error'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setOpenId(readAgentParam())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const patchQuery = useCallback(
    (patch: Partial<CatalogQuery>) => setQuery((current) => ({ ...current, ...patch })),
    [],
  )
  const resetQuery = useCallback(
    () => setQuery((current) => ({ ...DEFAULT_QUERY, sort: current.sort })),
    [],
  )

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
      <TopNav
        keyword={query.keyword}
        onKeywordChange={(keyword) => patchQuery({ keyword })}
        category={query.category}
        onCategoryChange={(category) => patchQuery({ category })}
      />

      <main>
        <Hero
          category={query.category}
          onCategoryChange={(category) => patchQuery({ category })}
          agentCount={agents.length}
        />

        <section id="explore" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">Explore agents</h2>
          <ExplorerToolbar
            query={query}
            onChange={patchQuery}
            onReset={resetQuery}
            resultCount={visible.length}
          />
          <div className="mt-6">
            <AgentGrid agents={visible} status={status} onOpen={openAgent} onReset={resetQuery} />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900/5 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:px-6 dark:text-slate-400">
          <p>AgentForge is open source under the MIT license.</p>
          <a
            href="https://github.com/aarmenia10/AgentForge"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-teal-600 dark:hover:text-teal-300"
          >
            <GitHubIcon className="size-4" />
            Source on GitHub
          </a>
        </div>
      </footer>

      {openedAgent && (
        <AgentDetailModal key={openedAgent.id} agent={openedAgent} onClose={closeAgent} />
      )}
    </>
  )
}
