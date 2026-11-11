import type { AgentCategoryTag, AgentFramework, AgentManifest } from '@/types/agent'

export type SortKey = 'popular' | 'newest' | 'top_rated'

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'newest', label: 'Newest' },
  { key: 'top_rated', label: 'Top Rated' },
]

export interface CatalogQuery {
  keyword: string
  category: AgentCategoryTag | null
  framework: AgentFramework | 'all'
  sort: SortKey
}

export const DEFAULT_QUERY: CatalogQuery = {
  keyword: '',
  category: null,
  framework: 'all',
  sort: 'popular',
}

/**
 * The manifest has no rating field, so the sort keys map onto `stats`:
 * Popular = views, Top Rated = stars, Newest = updated_at.
 */
const COMPARATORS: Record<SortKey, (a: AgentManifest, b: AgentManifest) => number> = {
  popular: (a, b) => b.stats.views - a.stats.views,
  top_rated: (a, b) => b.stats.stars - a.stats.stars,
  newest: (a, b) => Date.parse(b.stats.updated_at) - Date.parse(a.stats.updated_at),
}

function matchesKeyword(agent: AgentManifest, keyword: string): boolean {
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [
    agent.name,
    agent.id,
    agent.description,
    agent.author.name,
    agent.author.github,
    agent.framework,
    ...agent.tags,
    ...agent.tools_required.map((t) => t.name),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/** Pure, client-side filter + sort. Runs against the in-memory catalog snapshot. */
export function queryAgents(agents: readonly AgentManifest[], query: CatalogQuery): AgentManifest[] {
  return agents
    .filter(
      (agent) =>
        (query.category === null || agent.tags.includes(query.category)) &&
        (query.framework === 'all' || agent.framework === query.framework) &&
        matchesKeyword(agent, query.keyword),
    )
    .sort(COMPARATORS[query.sort])
}
