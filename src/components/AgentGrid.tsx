import { SearchX, TriangleAlert } from 'lucide-react'
import type { AgentManifest } from '@/types/agent'
import { AgentCard } from './AgentCard'
import { Reveal } from './Reveal'
import { ArrowIcon, primaryButtonClass } from './ui'

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
          <div key={index} className="h-60 animate-pulse rounded-3xl bg-surface" />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div role="alert" className="rounded-3xl bg-surface p-10 text-center">
        <TriangleAlert className="mx-auto size-8 text-amber-500" />
        <p className="mt-3 font-medium">The catalog failed to load.</p>
        <p className="mt-1 text-sm text-fg-muted">
          Check your connection and reload the page.
        </p>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-10 text-center">
        <SearchX className="mx-auto size-8 text-fg-muted" />
        <p className="mt-3 font-medium">No agents match these filters.</p>
        <button
          type="button"
          onClick={onReset}
          className={`${primaryButtonClass} mt-4`}
        >
          Clear filters
          <ArrowIcon />
        </button>
      </div>
    )
  }

  return (
    <ul className={gridClass}>
      {agents.map((agent, index) => (
        <Reveal as="li" key={agent.id} delay={(index % 3) * 80}>
          <AgentCard agent={agent} onOpen={onOpen} />
        </Reveal>
      ))}
    </ul>
  )
}
