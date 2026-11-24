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

export const CATEGORY_ICONS: Record<AgentCategoryTag, LucideIcon> = {
  coding: Code2,
  finance: LineChart,
  research: FlaskConical,
  devops: ServerCog,
  ops: Workflow,
  creative: Clapperboard,
}

export const categoryPillClass = (active: boolean) =>
  cn(
    'inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition duration-200 hover:-translate-y-0.5',
    active
      ? 'bg-accent text-accent-ink'
      : 'bg-surface text-fg hover:bg-surface-2',
  )

interface CategoryPillsProps {
  category: AgentCategoryTag | null
  onChange: (category: AgentCategoryTag | null) => void
}

/** Toggle pills that filter the agent catalog by category. */
export function CategoryPills({ category, onChange }: CategoryPillsProps) {
  return (
    <div
      role="group"
      aria-label="Browse by category"
      className="mb-4 flex flex-wrap gap-2.5"
    >
      {AGENT_CATEGORIES.map(({ tag, label }) => {
        const Icon = CATEGORY_ICONS[tag]
        const active = category === tag
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : tag)}
            className={categoryPillClass(active)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
