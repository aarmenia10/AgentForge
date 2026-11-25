/**
 * What the home page shows, as pure functions over the three public files
 * (`catalog.json`, `skills.json`, `councils.json`). No React, no DOM, and no
 * Firestore: browsing costs zero reads (invariant 3).
 */
import type { AgentManifest } from '../types/agent'
import type { CouncilIndexEntry } from '../types/council'
import type { SkillIndexEntry } from '../types/skill'

export type HomeItemKind = 'agent' | 'skill' | 'council'

/** One agent, skill, or council reduced to what a card or an electron needs. */
export interface HomeItem {
  kind: HomeItemKind
  id: string
  name: string
  description: string
  authorHandle: string
  /** Thumbs up: stars for agents, thumbs_up for skills, 0 for councils. */
  likes: number
  /** Last update as epoch milliseconds, 0 when the date is unreadable. */
  updatedAt: number
  /** Where the item lives on the site. */
  to: string
  /** Extra short text for cards, e.g. the member count of a council. */
  detail?: string
}

export const TRENDING_COUNT = 6

export function homeItemLink(kind: HomeItemKind, id: string): string {
  const encoded = encodeURIComponent(id)
  return kind === 'agent' ? `/agents?agent=${encoded}` : `/${kind}s/${encoded}`
}

function time(value: string | undefined): number {
  const ms = value ? Date.parse(value) : NaN
  return Number.isFinite(ms) ? ms : 0
}

function votes(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0
}

export function agentItem(agent: AgentManifest): HomeItem {
  return {
    kind: 'agent',
    id: agent.id,
    name: agent.name,
    description: agent.description,
    authorHandle: agent.author.handle,
    likes: votes(agent.stats.stars),
    updatedAt: time(agent.stats.updated_at),
    to: homeItemLink('agent', agent.id),
  }
}

export function skillItem(skill: SkillIndexEntry): HomeItem {
  return {
    kind: 'skill',
    id: skill.id,
    name: skill.name,
    description: skill.description,
    authorHandle: skill.author.handle,
    likes: votes(skill.stats.thumbs_up),
    updatedAt: time(skill.stats.updated_at),
    to: homeItemLink('skill', skill.id),
  }
}

/** Councils have no votes yet, so they count 0 and rank by newest. */
export function councilItem(council: CouncilIndexEntry): HomeItem {
  return {
    kind: 'council',
    id: council.id,
    name: council.name,
    description: council.description,
    authorHandle: council.author.handle,
    likes: 0,
    updatedAt: time(council.stats.updated_at),
    to: homeItemLink('council', council.id),
    detail: `${council.member_count} members`,
  }
}

/** Most liked first; ties go to the newest; then by name so order is stable. */
export function byLikesThenNewest(a: HomeItem, b: HomeItem): number {
  return (
    b.likes - a.likes ||
    b.updatedAt - a.updatedAt ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  )
}

/** The top items across agents, skills, and councils. Fewer exist: all of them. */
export function trendingItems(
  items: readonly HomeItem[],
  count = TRENDING_COUNT,
): HomeItem[] {
  return [...items].sort(byLikesThenNewest).slice(0, count)
}

export interface HomeSources {
  agents: readonly AgentManifest[]
  skills: readonly SkillIndexEntry[]
  councils: readonly CouncilIndexEntry[]
}

export function trendingFrom(sources: HomeSources): HomeItem[] {
  return trendingItems([
    ...sources.agents.map(agentItem),
    ...sources.skills.map(skillItem),
    ...sources.councils.map(councilItem),
  ])
}
