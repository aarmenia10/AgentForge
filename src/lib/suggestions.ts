import type { AgentManifest } from '@/types/agent'
import type { SkillIndexEntry } from '@/types/skill'
import type { UserPreferences } from '@/services/preferences'

type Category =
  'coding' | 'finance' | 'research' | 'devops' | 'ops' | 'creative'

const WORK_ROLE_MAP: Record<string, Category[]> = {
  Software: ['coding', 'devops'],
  'Data or finance': ['finance'],
  'Research or academia': ['research'],
  'Writing, marketing, or creative': ['creative'],
  'Operations or business': ['ops'],
  Student: ['coding', 'finance', 'research', 'devops', 'ops', 'creative'],
}

const USE_FOR_MAP: Record<string, Category[]> = {
  School: ['research', 'creative'],
  'My job': ['ops', 'finance'],
  'Coding projects': ['coding', 'devops'],
  Writing: ['creative'],
  Research: ['research'],
  Business: ['finance', 'ops'],
  'Personal projects': ['creative', 'coding'],
}

const GOALS_MAP: Record<string, Category[]> = {
  'Find agents and skills to use': [
    'coding',
    'finance',
    'research',
    'devops',
    'ops',
    'creative',
  ],
  'Share my own': ['ops'],
  'Use my own skills in all my AI apps': ['coding', 'devops'],
  'Just looking': [
    'coding',
    'finance',
    'research',
    'devops',
    'ops',
    'creative',
  ],
}

const AI_APPS_MAP: Record<string, Category[]> = {
  Claude: ['coding', 'research'],
  ChatGPT: ['creative', 'research'],
  Gemini: ['research', 'ops'],
  Cursor: ['coding', 'devops'],
  Codex: ['coding', 'devops'],
}

const HELP_TOPICS_MAP: Record<string, Category[]> = {
  Coding: ['coding'],
  Writing: ['creative'],
  Research: ['research'],
  'Data analysis': ['finance'],
  DevOps: ['devops'],
  'Planning and operations': ['ops'],
}

export interface SuggestionsResult {
  agents: AgentManifest[]
  skills: SkillIndexEntry[]
  few_matches: boolean
}

const ALL_CATEGORIES: Category[] = [
  'coding',
  'finance',
  'research',
  'devops',
  'ops',
  'creative',
]

/**
 * How much each category matters to this person. The topic answers (what
 * they will use AgentLemon for, what they want help with, and an old work
 * answer) decide which categories count. Goals and AI apps are broad (one
 * goal maps to every category), so they only add weight to categories the
 * topic answers already chose; they are used on their own only when there
 * are no topic answers, and with no answers at all every category counts.
 */
export function categoryWeights(prefs: UserPreferences): Map<Category, number> {
  const weights = new Map<Category, number>()
  const add = (cs: Category[] | undefined, by: number, onlyKnown = false) => {
    for (const c of cs ?? [])
      if (!onlyKnown || weights.has(c))
        weights.set(c, (weights.get(c) ?? 0) + by)
  }
  if (prefs.work_role) add(WORK_ROLE_MAP[prefs.work_role], 2)
  for (const use of prefs.use_for ?? []) add(USE_FOR_MAP[use], 2)
  for (const topic of prefs.help_topics ?? []) add(HELP_TOPICS_MAP[topic], 2)
  const topical = weights.size > 0
  for (const app of prefs.ai_apps ?? []) add(AI_APPS_MAP[app], 1, topical)
  if (!topical) for (const goal of prefs.goals ?? []) add(GOALS_MAP[goal], 1)
  if (weights.size === 0) for (const c of ALL_CATEGORIES) weights.set(c, 1)
  return weights
}

function score(tags: readonly string[], weights: Map<Category, number>) {
  return tags.reduce((sum, t) => sum + (weights.get(t as Category) ?? 0), 0)
}

export function computeSuggestions(
  prefs: UserPreferences,
  agents: readonly AgentManifest[],
  skills: readonly SkillIndexEntry[],
): SuggestionsResult {
  const weights = categoryWeights(prefs)

  // Only items that match at least one inferred category are suggestions;
  // otherwise every answer set shows the whole (small) catalog in a new order.
  const rankedAgents = [...agents]
    .map((a) => ({ item: a, score: score(a.tags, weights) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) => b.score - a.score || b.item.stats.views - a.item.stats.views,
    )
    .slice(0, 20)
    .map((x) => x.item)

  const rankedSkills = [...skills]
    .map((s) => ({ item: s, score: score(s.tags, weights) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.item.stats.updated_at) -
          Date.parse(a.item.stats.updated_at),
    )
    .slice(0, 20)
    .map((x) => x.item)

  return {
    agents: rankedAgents,
    skills: rankedSkills,
    few_matches: rankedAgents.length + rankedSkills.length < 5,
  }
}
