import {
  Building2,
  Bot,
  GraduationCap,
  Layers,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { RouteName } from '@/router/routes'

export interface SiteLink {
  to: string
  label: string
  /** The prefix hidden on narrow desktop widths to save room. */
  labelPrefix?: string
  icon: LucideIcon
  /** Routes that count as "on this page" for the current-page highlight. */
  routes: readonly RouteName[]
}

/**
 * The buttons in the top bar (md and up) and the first group in the sidebar
 * on a phone. Enterprise keeps its current label and link; it is being
 * renamed separately.
 */
export const SITE_LINKS: readonly SiteLink[] = [
  {
    to: '/academy',
    label: 'Academy',
    icon: GraduationCap,
    routes: ['academy'],
  },
  { to: '/agents', label: 'Agents', icon: Bot, routes: ['agents'] },
  { to: '/skills', label: 'Skills', icon: Layers, routes: ['skills', 'skill'] },
  {
    to: '/councils',
    label: 'Councils',
    icon: UsersRound,
    routes: ['councils', 'council', 'council-member'],
  },
  {
    to: '/enterprise',
    label: 'Enterprise',
    labelPrefix: 'AgentLemon\u00a0',
    icon: Building2,
    routes: ['enterprise'],
  },
]
