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

function inferCategories(prefs: UserPreferences): Set<Category> {
  const cats = new Set<Category>()
  const add = (cs: Category[]) => cs.forEach((c) => cats.add(c))
  if (prefs.work_role) {
    const mapped = WORK_ROLE_MAP[prefs.work_role]
    if (mapped) add(mapped)
  }
  for (const use of prefs.use_for ?? []) {
    const mapped = USE_FOR_MAP[use]
    if (mapped) add(mapped)
  }
  for (const goal of prefs.goals ?? []) {
    const mapped = GOALS_MAP[goal]
    if (mapped) add(mapped)
  }
  for (const app of prefs.ai_apps ?? []) {
    const mapped = AI_APPS_MAP[app]
    if (mapped) add(mapped)
  }
  for (const topic of prefs.help_topics ?? []) {
    const mapped = HELP_TOPICS_MAP[topic]
    if (mapped) add(mapped)
  }
  // No prefs at all → show everything
  if (cats.size === 0) {
    ;(
      [
        'coding',
        'finance',
        'research',
        'devops',
        'ops',
        'creative',
      ] as Category[]
    ).forEach((c) => cats.add(c))
  }
  return cats
}

function scoreAgent(agent: AgentManifest, cats: Set<Category>): number {
  return agent.tags.filter((t) => cats.has(t as Category)).length
}

function scoreSkill(skill: SkillIndexEntry, cats: Set<Category>): number {
  return skill.tags.filter((t) => cats.has(t as Category)).length
}

export function computeSuggestions(
  prefs: UserPreferences,
  agents: readonly AgentManifest[],
  skills: readonly SkillIndexEntry[],
): SuggestionsResult {
  const cats = inferCategories(prefs)

  // Only items that match at least one inferred category are suggestions;
  // otherwise every answer set shows the whole (small) catalog in a new order.
  const rankedAgents = [...agents]
    .map((a) => ({ item: a, score: scoreAgent(a, cats) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) => b.score - a.score || b.item.stats.views - a.item.stats.views,
    )
    .slice(0, 20)
    .map((x) => x.item)

  const rankedSkills = [...skills]
    .map((s) => ({ item: s, score: scoreSkill(s, cats) }))
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
