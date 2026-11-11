import { SearchX, TriangleAlert } from 'lucide-react'
import type { AgentManifest } from '@/types/agent'
import { AgentCard } from './AgentCard'

interface AgentGridProps {
  agents: AgentManifest[]
  status: 'loading' | 'ready' | 'error'
  onOpen: (agent: AgentManifest) => void
  onReset: () => void
}

const gridClass = 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3'

export function AgentGrid({ agents, status, onOpen, onReset }: AgentGridProps) {
  if (status === 'loading') {
    return (
      <div className={gridClass} aria-busy="true" aria-label="Loading agents">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="glass h-60 animate-pulse rounded-2xl" />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div role="alert" className="glass rounded-2xl p-10 text-center">
        <TriangleAlert className="mx-auto size-8 text-amber-500" />
        <p className="mt-3 font-medium">The catalog failed to load.</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Check your connection and reload the page.
        </p>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <SearchX className="mx-auto size-8 text-slate-400" />
        <p className="mt-3 font-medium">No agents match these filters.</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 rounded-xl bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <ul className={gridClass}>
      {agents.map((agent) => (
        <li key={agent.id}>
          <AgentCard agent={agent} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  )
}
