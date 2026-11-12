import { SearchX, TriangleAlert } from 'lucide-react'
import type { AgentManifest } from '@/types/agent'
import { AgentCard } from './AgentCard'

interface AgentGridProps {
  agents: AgentManifest[]
  status: 'loading' | 'ready' | 'error'
  onOpen: (agent: AgentManifest) => void
  onReset: () => void
}

const gridClass = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'

export function AgentGrid({ agents, status, onOpen, onReset }: AgentGridProps) {
  if (status === 'loading') {
    return (
      <div className={gridClass} aria-busy="true" aria-label="Loading agents">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-md border border-line bg-surface" />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div role="alert" className="rounded-md border border-line bg-surface p-8 text-center">
        <TriangleAlert className="mx-auto size-5 text-muted" />
        <p className="mt-3 font-medium">The catalog failed to load.</p>
        <p className="mt-1 text-sm text-muted">
          Check your connection and reload the page.
        </p>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface p-8 text-center">
        <SearchX className="mx-auto size-5 text-muted" />
        <p className="mt-3 font-medium">No agents match these filters.</p>
        <button
          type="button"
          onClick={onReset}
          className="btn-primary mt-4"
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
