import { displayAuthorName } from '@/lib/authorBranding'
import type { AgentManifest } from '@/types/agent'

export interface AuthorProfile {
  handle: string
  /** From the newest agent's author record. Null when there are no agents. */
  displayName: string | null
  /** Firebase uid from the catalog. Null when there are no agents. */
  uid: string | null
  /** "Verified author" on at least one of this author's public agents. */
  verified: boolean
  agents: AgentManifest[]
}

/**
 * Everything the public profile shows, from the catalog alone. Costs no
 * Firestore reads. Agents come newest first.
 */
export function authorProfile(
  catalog: readonly AgentManifest[],
  handle: string,
): AuthorProfile {
  const agents = catalog
    .filter((agent) => agent.author.handle === handle)
    .sort((a, b) => b.stats.updated_at.localeCompare(a.stats.updated_at))
  const newest = agents[0]
  return {
    handle,
    displayName: newest ? displayAuthorName(newest.author) : null,
    uid: newest?.author.uid ?? null,
    verified: agents.some((agent) => agent.author.verified),
    agents,
  }
}
