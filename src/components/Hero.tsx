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
import { Reveal } from './Reveal'
import { ArrowIcon, cn, primaryButtonClass } from './ui'

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
    <Reveal as="section" className="mx-auto max-w-7xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-24">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-fg">
        Open source · MCP-native · runs on the subscription you already pay for
      </p>

      <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[36px] font-semibold leading-[1.2] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]">
        The GitHub for <span className="text-accent-fg">AI Agents</span>
      </h1>

      <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg">
        Discover agents built on any framework, inspect their prompts, tools, and schema contracts,
        then add them to Claude or Cursor with one config snippet. No API keys. No inference bill.
      </p>

      <div className="mt-8">
        <a href="#explore" className={primaryButtonClass}>
          Explore agents
          <ArrowIcon />
        </a>
      </div>

      <div
        role="group"
        aria-label="Browse by category"
        className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2.5"
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
                'inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition duration-200 hover:-translate-y-0.5',
                active
                  ? 'bg-accent text-accent-ink'
                  : 'bg-surface text-fg hover:bg-surface-2',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          )
        })}
      </div>

      {agentCount > 0 && (
        <p className="mt-6 text-sm text-fg-muted">
          {agentCount} agents in the registry
        </p>
      )}
    </Reveal>
  )
}
