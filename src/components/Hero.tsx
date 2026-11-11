import {
  Clapperboard,
  Code2,
  FlaskConical,
  LineChart,
  ServerCog,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { AGENT_CATEGORIES, type AgentCategoryTag } from '@/types/agent'
import { cn } from './ui'

const CATEGORY_ICONS: Record<AgentCategoryTag, LucideIcon> = {
  coding: Code2,
  finance: LineChart,
  research: FlaskConical,
  devops: ServerCog,
  ops: Workflow,
  creative: Clapperboard,
}

interface HeroProps {
  category: AgentCategoryTag | null
  onCategoryChange: (category: AgentCategoryTag | null) => void
  agentCount: number
}

export function Hero({ category, onCategoryChange, agentCount }: HeroProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 pt-16 text-center sm:px-6 sm:pt-24">
      <p className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span className="size-1.5 rounded-full bg-teal-500" />
        Open source · MCP-native · runs on the subscription you already pay for
      </p>

      <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
        The GitHub for{' '}
        <span className="bg-gradient-to-r from-teal-500 via-teal-400 to-navy-400 bg-clip-text text-transparent">
          AI Agents
        </span>
      </h1>

      <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-slate-600 sm:text-lg dark:text-slate-300">
        Discover agents built on any framework, inspect their prompts, tools, and schema contracts,
        then add them to Claude or Cursor with one config snippet. No API keys. No inference bill.
      </p>

      <div
        role="group"
        aria-label="Browse by category"
        className="mx-auto mt-9 flex max-w-3xl flex-wrap justify-center gap-2.5"
      >
        {AGENT_CATEGORIES.map(({ tag, label }) => {
          const Icon = CATEGORY_ICONS[tag]
          const active = category === tag
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => onCategoryChange(active ? null : tag)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
                active
                  ? 'bg-teal-500 text-white shadow-glow'
                  : 'glass text-slate-700 hover:-translate-y-0.5 hover:text-teal-600 dark:text-slate-200 dark:hover:text-teal-300',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      {agentCount > 0 && (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          {agentCount} agents in the registry
        </p>
      )}
    </section>
  )
}
