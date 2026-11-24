import { Link } from '@/router/Router'
import { AGENT_CATEGORIES } from '@/types/agent'
import { CATEGORY_ICONS, categoryPillClass } from './CategoryPills'
import { Reveal } from './Reveal'
import { ArrowIcon, primaryButtonClass } from './ui'

interface HeroProps {
  agentCount: number
}

export function Hero({ agentCount }: HeroProps) {
  return (
    <Reveal as="section" className="mx-auto max-w-7xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-24">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-fg">
        Open source · Works with AI tools you already use
      </p>

      <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[36px] font-semibold leading-[1.2] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]">
        Achieve <span className="text-accent-fg">More.</span>
      </h1>

      <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg">
        Discover, download, and share AI tools that help you complete everyday tasks, save time,
        and work smarter. No coding or AI expertise required.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/agents" className={primaryButtonClass}>
          Explore Agents
          <ArrowIcon />
        </Link>
        <Link to="/skills" className={primaryButtonClass}>
          Explore Skills
          <ArrowIcon />
        </Link>
        <Link to="/councils" className={primaryButtonClass}>
          Explore Councils
          <ArrowIcon />
        </Link>
      </div>

      <nav
        aria-label="Browse agents by category"
        className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2.5"
      >
        {AGENT_CATEGORIES.map(({ tag, label }) => {
          const Icon = CATEGORY_ICONS[tag]
          return (
            <Link
              key={tag}
              to={`/agents?category=${tag}`}
              className={categoryPillClass(false)}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      {agentCount > 0 && (
        <p className="mt-6 text-sm text-fg-muted">
          {agentCount} agents in the registry
        </p>
      )}
    </Reveal>
  )
}
