import {
  ClipboardCheck,
  FilePlus2,
  LayoutGrid,
  Palette,
  Plus,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { RouteName } from '@/router/routes'
import { SITE_LINKS } from './siteLinks'

/**
 * One row in the sidebar. The sidebar renders a plain array of these, so a
 * later change (favorites, reordering) edits the array and not the markup.
 */
export interface SidebarItem {
  id: string
  to: string
  label: string
  icon: LucideIcon
  /** A count shown at the right, for example new demo requests. */
  badge?: number | null
  /** Routes that mark this row as the current page. Defaults to an exact path match. */
  routes?: readonly RouteName[]
}

/** Agents, Skills, Councils, Enterprise: the top bar's buttons, moved here on a phone. */
export function siteItems(): SidebarItem[] {
  return SITE_LINKS.map(({ to, label, labelPrefix, icon, routes }) => ({
    id: to,
    to,
    label: `${labelPrefix ?? ''}${label}`,
    icon,
    routes,
  }))
}

/** For a signed-out visitor on a phone: Appearance lives in Settings now. */
export function visitorItems(): SidebarItem[] {
  return [
    ...siteItems(),
    { id: 'appearance', to: '/settings', label: 'Appearance', icon: Palette },
  ]
}

/** Exactly what the account dropdown held before the sidebar. */
export function accountItems(options: {
  isAdmin: boolean
  founder: boolean
  newDemoRequests: number | null
}): SidebarItem[] {
  const items: SidebarItem[] = [
    { id: 'me', to: '/me', label: 'My items', icon: LayoutGrid },
    {
      id: 'suggestions',
      to: '/suggestions',
      label: 'Suggestions',
      icon: Sparkles,
    },
    { id: 'new-agent', to: '/studio', label: 'New agent', icon: Plus },
    { id: 'new-skill', to: '/skills/new', label: 'New skill', icon: FilePlus2 },
    { id: 'friends', to: '/friends', label: 'Friends', icon: Users },
    { id: 'settings', to: '/settings', label: 'Settings', icon: Settings },
  ]
  if (options.founder)
    items.push({
      id: 'demo-requests',
      to: '/admin/demo-requests',
      label: 'Demo Requests',
      icon: ClipboardCheck,
      badge: options.newDemoRequests,
    })
  if (options.isAdmin)
    items.push({
      id: 'review',
      to: '/review',
      label: 'Review queue',
      icon: ClipboardCheck,
    })
  return items
}
