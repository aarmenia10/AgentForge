import { Link, useRoute } from '@/router/Router'
import { cn } from '../ui'
import type { SidebarItem } from './sidebarItems'

/** Renders a sidebar's item array as a list of links. */
export function SidebarList({
  label,
  items,
  onNavigate,
}: {
  label: string
  items: readonly SidebarItem[]
  onNavigate: () => void
}) {
  const { route, location } = useRoute()
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {items.map(({ id, to, label: text, icon: Icon, badge, routes }) => {
          const current = routes
            ? routes.includes(route.name)
            : location.pathname === to
          return (
            <li key={id}>
              <Link
                to={to}
                onClick={onNavigate}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]',
                  current
                    ? 'bg-accent text-accent-ink'
                    : 'text-fg hover:bg-surface-2',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {text}
                {badge !== null && badge !== undefined && (
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold',
                      current
                        ? 'bg-accent-ink text-accent'
                        : 'bg-accent text-accent-ink',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
