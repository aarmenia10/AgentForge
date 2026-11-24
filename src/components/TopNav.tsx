import { Anvil } from 'lucide-react'
import { Link, useRoute } from '@/router/Router'
import { AccountMenu } from './auth/AccountMenu'
import { NavSearch } from './nav/NavSearch'
import { SITE_LINKS } from './nav/siteLinks'
import { cn } from './ui'

const navButton =
  'inline-flex h-10 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]'

/**
 * The top bar. Left to right: logo, one wide search field, the Agents, Skills,
 * Councils, and Enterprise buttons, and the account control. Below md the four
 * buttons move into the sidebar and the search field collapses to an icon.
 */
export function TopNav() {
  const { route } = useRoute()

  return (
    // Relative to this header, the phone search covers the bar. The blur lives
    // on its own layer so it does not trap that overlay.
    <header className="sticky top-0 z-30">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 border-b border-line/60 bg-page/85 backdrop-blur-md"
      />
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6 md:gap-4">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]"
          aria-label="AgentLemon home"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink">
            <Anvil className="size-5" aria-hidden="true" />
          </span>
          <span className="hidden text-lg font-semibold tracking-tight sm:block md:hidden lg:block">
            Agent<span className="text-accent-fg">Lemon</span>
          </span>
        </Link>

        <NavSearch />

        <nav aria-label="Main" className="hidden shrink-0 items-center gap-2 md:flex">
          {SITE_LINKS.map(({ to, label, labelPrefix, routes }) => {
            const current = routes.includes(route.name)
            return (
              <Link
                key={to}
                to={to}
                aria-current={current ? 'page' : undefined}
                aria-label={labelPrefix ? `${labelPrefix}${label}` : undefined}
                className={cn(
                  navButton,
                  current
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface text-fg hover:bg-surface-2',
                )}
              >
                {labelPrefix && (
                  <span aria-hidden="true" className="hidden lg:inline">
                    {labelPrefix}
                  </span>
                )}
                {label}
              </Link>
            )
          })}
        </nav>

        <AccountMenu />
      </div>
    </header>
  )
}
