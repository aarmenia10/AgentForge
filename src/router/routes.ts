/**
 * The site's route table. Pure: no React and no DOM, so tests import it
 * directly. Static files (`/catalog.json`, `/llms.txt`, `/mcp/*`) are served by
 * Hosting before the SPA rewrite and never reach this table.
 */
import {
  agentIdSchema,
  authorHandleSchema,
  versionSchema,
} from '../lib/manifestSchema'

export type RouteName =
  | 'home'
  | 'about'
  | 'me'
  | 'settings'
  | 'connect'
  | 'friends'
  | 'studio'
  | 'review'
  | 'profile'
  | 'councils'
  | 'council'
  | 'council-member'
  | 'skills'
  | 'skill-upload'
  | 'skill'
  | 'enterprise'
  | 'demo-requests'
  | 'suggestions'
  | 'not-found'

export interface Route {
  name: RouteName
  /** `handle` for `profile`, `id` for `skill`. Empty for every other route. */
  params: Record<string, string>
}

/** Pages that need an account. They render through RequireAccount. */
export const SIGNED_IN_ROUTES: readonly RouteName[] = [
  'me',
  'settings',
  'friends',
  'studio',
  'review',
  'skill-upload',
  'suggestions',
]

const STATIC: Record<string, RouteName> = {
  '/': 'home',
  '/about': 'about',
  '/index.html': 'home',
  '/me': 'me',
  '/settings': 'settings',
  '/connect': 'connect',
  '/friends': 'friends',
  '/studio': 'studio',
  '/review': 'review',
  '/skills': 'skills',
  '/councils': 'councils',
  // Matched before /skills/<id>, so "new" can never be a skill's page.
  '/skills/new': 'skill-upload',
  '/suggestions': 'suggestions',
  '/enterprise': 'enterprise',
  '/admin/demo-requests': 'demo-requests',
}

export function matchRoute(pathname: string): Route {
  // Tolerate one trailing slash ("/me/"), but keep "/" itself.
  const path = /^\/.*[^/]\/$/.test(pathname)
    ? pathname.slice(0, -1)
    : pathname || '/'

  const name = STATIC[path]
  if (name) return { name, params: {} }

  const member = /^\/councils\/member\/(agent|skill)\/([^/]+)\/([^/]+)$/.exec(
    path,
  )
  if (member) {
    const id = agentIdSchema.safeParse(decodeSegment(member[2]))
    const version = versionSchema.safeParse(decodeSegment(member[3]))
    if (id.success && version.success)
      return {
        name: 'council-member',
        params: { kind: member[1], id: id.data, version: version.data },
      }
    return notFound()
  }
  const council = /^\/councils\/([^/]+)$/.exec(path)
  if (council) {
    const id = agentIdSchema.safeParse(decodeSegment(council[1]))
    if (id.success) return { name: 'council', params: { id: id.data } }
    return notFound()
  }

  const skill = /^\/skills\/([^/]+)$/.exec(path)
  if (skill) {
    const id = decodeSegment(skill[1])
    if (id !== null && agentIdSchema.safeParse(id).success)
      return { name: 'skill', params: { id } }
    return notFound()
  }

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

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
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
    case 'about':
      return `About AgentLemon · ${SITE}`
    case 'me':
      return `My items · ${SITE}`
    case 'settings':
      return `Settings · ${SITE}`
    case 'connect':
      return `Connect to ${SITE}`
    case 'friends':
      return `Friends · ${SITE}`
    case 'studio':
      return `Manifest Studio · ${SITE}`
    case 'review':
      return `Review queue · ${SITE}`
    case 'profile':
      return `@${route.params.handle} · ${SITE}`
    case 'councils':
      return 'Councils · ' + SITE
    case 'council':
    case 'council-member':
      return route.params.id + ' · Councils · ' + SITE
    case 'skills':
      return `Skills · ${SITE}`
    case 'skill-upload':
      return `Upload a skill · ${SITE}`
    case 'skill':
      return `${route.params.id} · Skills · ${SITE}`
    case 'demo-requests':
      return `Demo Requests · ${SITE}`
    case 'enterprise':
      return `AgentForce Enterprise · ${SITE}`
    case 'suggestions':
      return `Suggestions · ${SITE}`
    case 'not-found':
      return `Page not found · ${SITE}`
  }
}
