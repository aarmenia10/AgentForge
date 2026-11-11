import { Anvil, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider'
import { AGENT_CATEGORIES, type AgentCategoryTag } from '@/types/agent'
import { cn, GitHubIcon } from './ui'

interface TopNavProps {
  keyword: string
  onKeywordChange: (keyword: string) => void
  category: AgentCategoryTag | null
  onCategoryChange: (category: AgentCategoryTag | null) => void
}

export function TopNav({ keyword, onKeywordChange, category, onCategoryChange }: TopNavProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="AgentForge home">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-navy-600 text-white shadow-lg shadow-teal-500/25">
            <Anvil className="size-5" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:block">
            Agent<span className="text-teal-500">Forge</span>
          </span>
        </a>

        <label className="relative min-w-0 flex-1 md:max-w-sm">
          <span className="sr-only">Search agents</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="Search agents, tools, authors"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white/70 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-white/5"
          />
        </label>

        <nav aria-label="Categories" className="hidden items-center gap-1 lg:flex">
          {AGENT_CATEGORIES.slice(0, 4).map(({ tag, label }) => (
            <a
              key={tag}
              href="#explore"
              onClick={() => onCategoryChange(category === tag ? null : tag)}
              aria-current={category === tag ? 'true' : undefined}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition',
                category === tag
                  ? 'text-teal-600 dark:text-teal-300'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="grid size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          {/* Placeholder: wired to AuthService.signInWithGitHub in a later pass. */}
          <button
            type="button"
            disabled
            title="GitHub sign-in is coming soon"
            className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-medium text-white opacity-90 dark:bg-white dark:text-navy-950"
          >
            <GitHubIcon className="size-4" />
            <span className="hidden sm:inline">Sign in with GitHub</span>
          </button>
        </div>
      </div>
    </header>
  )
}
