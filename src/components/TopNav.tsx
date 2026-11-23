import { Anvil, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider'
import { AGENT_CATEGORIES, type AgentCategoryTag } from '@/types/agent'
import { Link, useRoute } from '@/router/Router'
import { AppearanceMenu } from './appearance/AppearanceMenu'
import { AccountMenu } from './auth/AccountMenu'
import { cn } from './ui'

interface NavSearch {
  keyword: string
  onKeywordChange: (keyword: string) => void
  category: AgentCategoryTag | null
  onCategoryChange: (category: AgentCategoryTag | null) => void
}

interface TopNavProps {
  /** The search box and category links. Passed on the home page only. */
  search?: NavSearch
}

const navLink =
  'inline-flex h-10 items-center rounded-full px-2.5 text-sm font-medium transition sm:px-3.5'

export function TopNav({ search }: TopNavProps) {
  const { theme, toggleTheme } = useTheme()
  const { route } = useRoute()
  const onSkills = route.name === 'skills' || route.name === 'skill'

  return (
    // Relative to this header, the Appearance panel opens just under it. The
    // blur lives on its own layer so it does not trap that panel.
    <header className="sticky top-0 z-30">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 border-b border-line/60 bg-page/85 backdrop-blur-md"
      />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-4 sm:px-6 md:flex-nowrap">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="AgentLemon home">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink">
            <Anvil className="size-5" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:block">
            Agent<span className="text-accent-fg">Lemon</span>
          </span>
        </Link>

        {search && <SearchAndCategories {...search} />}

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
          <Link
            to="/enterprise"
            aria-current={route.name === 'enterprise' ? 'page' : undefined}
            className={cn(
              navLink,
              route.name === 'enterprise' ? 'text-accent-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
            )}
          >
            <span className="hidden md:inline">AgentForce&nbsp;</span>Enterprise
          </Link>
          <Link
            to="/skills"
            aria-current={onSkills ? 'page' : undefined}
            className={cn(navLink, onSkills ? 'text-accent-fg' : 'text-fg-muted hover:bg-surface hover:text-fg')}
          >
            Skills
          </Link>
          <AppearanceMenu />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="grid size-10 place-items-center rounded-full text-fg-muted transition hover:bg-surface hover:text-fg"
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}

function SearchAndCategories({ keyword, onKeywordChange, category, onCategoryChange }: NavSearch) {
  return (
    <>
      {/* Own row on a phone, so the buttons beside the logo keep their room. */}
      <label className="relative order-last min-w-0 basis-full md:order-none md:min-w-32 md:max-w-sm md:flex-1 md:basis-auto">
        <span className="sr-only">Search agents</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="Search agents, tools, authors"
          className="h-10 w-full rounded-full border border-transparent bg-surface pl-10 pr-4 text-sm placeholder:text-fg-muted focus:border-accent-fg focus:outline-none"
        />
      </label>

      <nav aria-label="Categories" className="hidden items-center gap-1 2xl:flex">
        {AGENT_CATEGORIES.slice(0, 4).map(({ tag, label }) => (
          <a
            key={tag}
            href="#explore"
            onClick={() => onCategoryChange(category === tag ? null : tag)}
            aria-current={category === tag ? 'true' : undefined}
            className={cn(
              'rounded-full px-3.5 py-2 text-sm font-medium transition',
              category === tag ? 'text-accent-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
            )}
          >
            {label}
          </a>
        ))}
      </nav>
    </>
  )
}
