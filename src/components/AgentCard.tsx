import { Eye, Star, Wrench } from 'lucide-react'
import { formatCount, formatRelativeTime } from '@/lib/format'
import type { AgentManifest } from '@/types/agent'
import { AuthorTag, FrameworkBadge } from './ui'

interface AgentCardProps {
  agent: AgentManifest
  onOpen: (agent: AgentManifest) => void
}

export function AgentCard({ agent, onOpen }: AgentCardProps) {
  const toolCount = agent.tools_required.length

  return (
    <article className="glass group relative flex h-full flex-col rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:shadow-glow">
      <div className="flex items-start justify-between gap-3">
        <FrameworkBadge framework={agent.framework} />
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <Star className="size-3.5 fill-current" />
          {formatCount(agent.stats.stars)}
          <span className="sr-only"> stars</span>
        </span>
      </div>

      <h3 className="mt-4 text-lg font-semibold tracking-tight">
        {/* The stretched button makes the whole card one click target. */}
        <button
          type="button"
          onClick={() => onOpen(agent)}
          className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-teal-500"
        >
          {agent.name}
        </button>
        <span className="ml-2 font-mono text-xs font-normal text-slate-400">v{agent.version}</span>
      </h3>

      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {agent.description}
      </p>

      <ul className="mb-4 mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
        {agent.tags.slice(0, 3).map((tag) => (
          <li
            key={tag}
            className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300"
          >
            #{tag}
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-slate-900/5 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
        <AuthorTag author={agent.author} />
        <div className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1" title="Required tools">
            <Wrench className="size-3.5" />
            {toolCount} {toolCount === 1 ? 'tool' : 'tools'}
          </span>
          <span className="inline-flex items-center gap-1" title="Views">
            <Eye className="size-3.5" />
            {formatCount(agent.stats.views)}
          </span>
        </div>
      </footer>
      <p className="mt-2 text-[11px] text-slate-400">
        Updated {formatRelativeTime(agent.stats.updated_at)}
      </p>
    </article>
  )
}
