import { Star } from 'lucide-react'
import { formatCount, formatRelativeTime } from '@/lib/format'
import type { AgentManifest } from '@/types/agent'
import { AuthorTag, FrameworkBadge } from './ui'

interface AgentCardProps {
  agent: AgentManifest
  onOpen: (agent: AgentManifest) => void
}

/** How many tool names a card lists before collapsing the rest into "+N". */
const MAX_TOOLS_SHOWN = 3

export function AgentCard({ agent, onOpen }: AgentCardProps) {
  const tools = agent.tools_required
  const hiddenTools = tools.length - MAX_TOOLS_SHOWN

  return (
    <article className="relative flex h-full flex-col rounded-md border border-line bg-surface p-4 hover:border-edge">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 text-[15px] leading-snug font-semibold">
          {/* The stretched button makes the whole card one click target. */}
          <button
            type="button"
            onClick={() => onOpen(agent)}
            className="text-left after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent"
          >
            {agent.name}
          </button>
        </h3>
        <span className="shrink-0 font-mono text-xs text-subtle">v{agent.version}</span>
      </div>

      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{agent.description}</p>

      <dl className="mt-3 mb-3 space-y-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-subtle">Tools</dt>
          <dd className="min-w-0 font-mono break-words text-muted">
            {tools.length === 0
              ? 'none'
              : tools
                  .slice(0, MAX_TOOLS_SHOWN)
                  .map((tool) => tool.name)
                  .join(', ')}
            {hiddenTools > 0 && <span className="text-subtle"> +{hiddenTools}</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-subtle">Tags</dt>
          <dd className="min-w-0 break-words text-muted">{agent.tags.join(', ')}</dd>
        </div>
      </dl>

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs text-subtle">
        <FrameworkBadge framework={agent.framework} />
        <AuthorTag author={agent.author} />
        <span className="ml-auto inline-flex items-center gap-1">
          <Star className="size-3.5" aria-hidden="true" />
          {formatCount(agent.stats.stars)}
          <span className="sr-only"> stars</span>
        </span>
        <span>{formatRelativeTime(agent.stats.updated_at)}</span>
      </footer>
    </article>
  )
}
