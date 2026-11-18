/**
 * The site's route table. Pure: no React and no DOM, so tests import it
 * directly. Static files (`/catalog.json`, `/llms.txt`, `/mcp/*`) are served by
 * Hosting before the SPA rewrite and never reach this table.
 */
import { authorHandleSchema } from '../lib/manifestSchema'

export type RouteName =
  | 'home'
  | 'me'
  | 'settings'
  | 'friends'
  | 'studio'
  | 'review'
  | 'profile'
  | 'not-found'

export interface Route {
  name: RouteName
  /** `handle` for `profile`. Empty for every other route. */
  params: Record<string, string>
}

/** Pages that need an account. They render through RequireAccount. */
export const SIGNED_IN_ROUTES: readonly RouteName[] = [
  'me',
  'settings',
  'friends',
  'studio',
  'review',
]

const STATIC: Record<string, RouteName> = {
  '/': 'home',
  '/index.html': 'home',
  '/me': 'me',
  '/settings': 'settings',
  '/friends': 'friends',
  '/studio': 'studio',
  '/review': 'review',
}

export function matchRoute(pathname: string): Route {
  // Tolerate one trailing slash ("/me/"), but keep "/" itself.
  const path = /^\/.*[^/]\/$/.test(pathname)
    ? pathname.slice(0, -1)
    : pathname || '/'

  const name = STATIC[path]
  if (name) return { name, params: {} }

  const profile = /^\/u\/([^/]+)$/.exec(path)
  if (profile) {
    let handle: string
    try {
      handle = decodeURIComponent(profile[1])
    } catch {
      return notFound()
    }
    if (authorHandleSchema.safeParse(handle).success) {
      return { name: 'profile', params: { handle } }
    }
  }
  return notFound()
}

function notFound(): Route {
  return { name: 'not-found', params: {} }
}

const SITE = 'AgentLemon'

/** The document title for a route. Home keeps the title from index.html. */
export function routeTitle(route: Route): string {
  switch (route.name) {
    case 'home':
      return `${SITE} · The GitHub for AI Agents`
    case 'me':
      return `My agents · ${SITE}`
    case 'settings':
      return `Settings · ${SITE}`
    case 'friends':
      return `Friends · ${SITE}`
    case 'studio':
      return `Manifest Studio · ${SITE}`
    case 'review':
      return `Review queue · ${SITE}`
    case 'profile':
      return `@${route.params.handle} · ${SITE}`
    case 'not-found':
      return `Page not found · ${SITE}`
  }
}
