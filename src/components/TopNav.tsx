import { Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider'
import { AGENT_CATEGORIES, type AgentCategoryTag } from '@/types/agent'
import { cn } from './ui'

interface TopNavProps {
  keyword: string
  onKeywordChange: (keyword: string) => void
  category: AgentCategoryTag | null
  onCategoryChange: (category: AgentCategoryTag | null) => void
}

export function TopNav({ keyword, onKeywordChange, category, onCategoryChange }: TopNavProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <a
          href="/"
          className="shrink-0 rounded font-mono text-sm font-semibold tracking-tight text-ink"
          aria-label="AgentForge home"
        >
          agentforge
        </a>

        <label className="relative min-w-0 flex-1 md:max-w-xs">
          <span className="sr-only">Search agents</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="Search agents, tools, authors"
            className="field h-8 w-full pl-8"
          />
        </label>

        <nav aria-label="Categories" className="hidden items-center gap-4 lg:flex">
          {AGENT_CATEGORIES.slice(0, 4).map(({ tag, label }) => (
            <a
              key={tag}
              href="#explore"
              onClick={() => onCategoryChange(category === tag ? null : tag)}
              aria-current={category === tag ? 'true' : undefined}
              className={cn(
                'rounded text-sm',
                category === tag ? 'font-medium text-accent' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="grid size-8 place-items-center rounded text-muted hover:bg-sunken hover:text-ink"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {/* Placeholder until sign-in ships (README task P2-2). */}
          <button
            type="button"
            disabled
            title="Sign-in is coming soon"
            className="h-8 cursor-not-allowed rounded px-2 text-sm text-subtle"
          >
            Sign in
          </button>
        </div>
      </div>
    </header>
  )
}
