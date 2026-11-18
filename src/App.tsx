import { lazy, Suspense, useCallback, useState, type ComponentType } from 'react'
import { PageHold } from './components/PageShell'
import { TopNav } from './components/TopNav'
import { GitHubIcon } from './components/ui'
import { DEFAULT_QUERY, type CatalogQuery } from './lib/catalog'
import { HomePage } from './pages/HomePage'
import { useRoute } from './router/Router'
import type { RouteName } from './router/routes'

// Every page but the home page is its own chunk. None of them, and nothing
// that reaches Firebase, is in the startup bundle (tests/auth-ui.test.ts).
const PAGES: Record<Exclude<RouteName, 'home'>, ComponentType> = {
  me: lazy(() => import('./pages/MePage')),
  settings: lazy(() => import('./pages/SettingsPage')),
  friends: lazy(() => import('./pages/FriendsPage')),
  studio: lazy(() => import('./pages/StudioPage')),
  review: lazy(() => import('./pages/ReviewPage')),
  profile: lazy(() => import('./pages/ProfilePage')),
  'not-found': lazy(() => import('./pages/NotFoundPage')),
}

/** The shell: nav, the routed page, the footer. */
export default function App() {
  const { route } = useRoute()
  // Lives here, not in HomePage, because the nav's search box drives it. It
  // also means a search survives a trip to another page and back.
  const [query, setQuery] = useState<CatalogQuery>(DEFAULT_QUERY)

  const patchQuery = useCallback(
    (patch: Partial<CatalogQuery>) => setQuery((current) => ({ ...current, ...patch })),
    [],
  )
  const resetQuery = useCallback(
    () => setQuery((current) => ({ ...DEFAULT_QUERY, sort: current.sort })),
    [],
  )

  const isHome = route.name === 'home'
  const Page = route.name === 'home' ? null : PAGES[route.name]

  return (
    // A column so the footer sits at the bottom of short pages.
    <div className="flex min-h-dvh flex-col">
      <TopNav
        search={
          isHome
            ? {
                keyword: query.keyword,
                onKeywordChange: (keyword) => patchQuery({ keyword }),
                category: query.category,
                onCategoryChange: (category) => patchQuery({ category }),
              }
            : undefined
        }
      />

      {Page ? (
        <Suspense fallback={<PageHold />}>
          {/* Keyed so each arrival mounts fresh, e.g. /u/a to /u/b. */}
          <Page key={`${route.name}:${route.params.handle ?? ''}`} />
        </Suspense>
      ) : (
        <HomePage query={query} patchQuery={patchQuery} resetQuery={resetQuery} />
      )}

      <footer className="border-t border-slate-900/5 py-8 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 text-sm text-slate-500 sm:px-6 dark:text-slate-400">
          <p>AgentLemon is open source under the MIT license.</p>
          <a
            href="https://github.com/aarmenia10/AgentForge"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-teal-600 dark:hover:text-teal-300"
          >
            <GitHubIcon className="size-4" />
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}
