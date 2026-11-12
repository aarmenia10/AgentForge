import { AGENT_CATEGORIES, type AgentCategoryTag } from '@/types/agent'
import { cn } from './ui'

interface HeroProps {
  category: AgentCategoryTag | null
  onCategoryChange: (category: AgentCategoryTag | null) => void
  agentCount: number
}

/** Page header: what this is, in three lines, then the category filter. */
export function Hero({ category, onCategoryChange, agentCount }: HeroProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-10 pb-8 sm:px-6 sm:pt-14">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        The GitHub for AI Agents
      </h1>

      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted">
        A registry of agents built on any framework. Read the prompt, the tools, and the schema
        contract before you install anything, then add an agent to Claude or Cursor with one config
        snippet. No API keys. No inference bill.
      </p>

      <p className="mt-3 font-mono text-xs text-subtle">
        {agentCount > 0 && `${agentCount} agents / `}open source / MCP-native / runs on the
        subscription you already have
      </p>

      <div
        role="group"
        aria-label="Browse by category"
        className="mt-6 flex flex-wrap gap-x-1 gap-y-1.5"
      >
        {AGENT_CATEGORIES.map(({ tag, label }) => {
          const active = category === tag
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onCategoryChange(active ? null : tag)}
              className={cn(
                'h-8 rounded border px-3 text-sm',
                active
                  ? 'border-accent font-medium text-accent'
                  : 'border-line text-muted hover:border-edge hover:text-ink',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
