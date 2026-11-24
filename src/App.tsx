import { lazy, Suspense, useLayoutEffect, type ComponentType } from 'react'
import { PageHold } from './components/PageShell'
import { TopNav } from './components/TopNav'
import { GitHubIcon } from './components/ui'
import { HomePage } from './pages/HomePage'
import { Link, useRoute } from './router/Router'
import { legacyRedirect, type RouteName } from './router/routes'

// Every page but the home page is its own chunk. None of them, and nothing
// that reaches Firebase, is in the startup bundle (tests/auth-ui.test.ts).
const PAGES: Record<Exclude<RouteName, 'home'>, ComponentType> = {
  agents: lazy(() => import('./pages/AgentsPage')),
  search: lazy(() => import('./pages/SearchPage')),
  about: lazy(() => import('./pages/AboutPage')),
  me: lazy(() => import('./pages/MePage')),
  settings: lazy(() => import('./pages/SettingsPage')),
  connect: lazy(() => import('./pages/ConnectPage')),
  friends: lazy(() => import('./pages/FriendsPage')),
  studio: lazy(() => import('./pages/StudioPage')),
  review: lazy(() => import('./pages/ReviewPage')),
  profile: lazy(() => import('./pages/ProfilePage')),
  councils: lazy(() => import('./pages/CouncilsPage')),
  council: lazy(() => import('./pages/CouncilPage')),
  'council-member': lazy(() => import('./pages/CouncilMemberPage')),
  skills: lazy(() => import('./pages/SkillsPage')),
  'skill-upload': lazy(() => import('./pages/SkillUploadPage')),
  skill: lazy(() => import('./pages/SkillPage')),
  'demo-requests': lazy(() => import('./pages/DemoRequestsPage')),
  enterprise: lazy(() => import('./pages/EnterprisePage')),
  suggestions: lazy(() => import('./pages/SuggestionsPage')),
  'not-found': lazy(() => import('./pages/NotFoundPage')),
}

/** The shell: nav, the routed page, the footer. */
export default function App() {
  const { route, location, go } = useRoute()

  // The catalog moved to /agents, so an old /?agent=<id> link goes there.
  const redirect = legacyRedirect(
    location.pathname,
    location.search,
    window.location.hash,
  )
  useLayoutEffect(() => {
    if (redirect) go(redirect, { replace: true })
  }, [redirect, go])

  const Page = route.name === 'home' ? null : PAGES[route.name]

  return (
    // A column so the footer sits at the bottom of short pages.
    <div className="flex min-h-dvh flex-col">
      <TopNav />

      {redirect ? (
        <PageHold />
      ) : Page ? (
        <Suspense fallback={<PageHold />}>
          {/* Keyed so each arrival mounts fresh, e.g. /u/a to /u/b. */}
          <Page
            key={`${route.name}:${route.params.handle ?? route.params.id ?? ''}:${route.params.kind ?? ''}:${route.params.version ?? ''}:${route.name === 'council' ? location.search : ''}`}
          />
        </Suspense>
      ) : (
        <HomePage />
      )}

      <footer className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-3xl bg-surface px-6 py-6 text-sm text-fg-muted sm:rounded-4xl sm:px-8">
          <p>AgentLemon is open source under the MIT license.</p>
          <Link to="/about" className="rounded-full hover:text-fg">
            About AgentLemon
          </Link>
          <a
            href="https://github.com/aarmenia10/AgentLemon"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full hover:text-fg"
          >
            <GitHubIcon className="size-4" />
            Source on GitHub
          </a>
        </div>
        <p className="mt-4 text-center text-xs text-fg-muted">
          An Aidan Armenia and Thomas Certo Production.
        </p>
      </footer>
    </div>
  )
}
