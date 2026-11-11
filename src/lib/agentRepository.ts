import { SEED_AGENTS } from '../data/seedAgents'
import type { AgentManifest } from '../types/agent'
import { validateCatalog } from './validateManifest'

/**
 * Data-access contract for the catalog. The UI depends only on this interface,
 * so the backing store can be swapped without touching components.
 *
 * Read path guidance (Spark plan): `listAgents` should resolve from a static
 * `catalog.json` snapshot on Firebase Hosting, not a live collection scan.
 * A full-collection read per visitor exhausts the 50k reads/day quota at
 * roughly (50,000 / catalog size) page loads. See README, "Staying at $0".
 */
export interface AgentRepository {
  /** Full catalog snapshot. Filtering and sorting happen client-side. */
  listAgents(): Promise<AgentManifest[]>
  /** Single manifest by slug, or null when it does not exist. */
  getAgent(id: string): Promise<AgentManifest | null>
  /** Create or replace a manifest. Caller must be the authenticated author. */
  publishAgent(manifest: AgentManifest): Promise<void>
  /** Remove a manifest. Caller must be the authenticated author. */
  deleteAgent(id: string): Promise<void>
  /** Toggle the signed-in user's star. Resolves to the new star count. */
  toggleStar(id: string, userId: string): Promise<number>
  /** Fire-and-forget view counter. Must never throw into the UI. */
  recordView(id: string): Promise<void>
}

const notImplemented = (method: string) => () =>
  Promise.reject(new Error(`AgentRepository.${method} is not implemented yet`))

/** Local repository backed by the seed catalog. Read-only. */
export const seedAgentRepository: AgentRepository = {
  listAgents: async () => [...SEED_AGENTS],
  getAgent: async (id) => SEED_AGENTS.find((agent) => agent.id === id) ?? null,
  publishAgent: notImplemented('publishAgent'),
  deleteAgent: notImplemented('deleteAgent'),
  toggleStar: notImplemented('toggleStar'),
  recordView: async () => {},
}

/** Static reads, authenticated Firestore stars. Publishing awaits the author flow. */
export function createFirestoreAgentRepository(): AgentRepository {
  let cached = structuredClone([...SEED_AGENTS])
  let pending: Promise<AgentManifest[]> | undefined
  const listAgents = (): Promise<AgentManifest[]> => {
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetch('/catalog.json', {
            signal: AbortSignal.timeout(5000),
          })
          if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`)
          cached = validateCatalog(await response.json())
        } catch {
          // Network, SPA rewrite, or invalid snapshot: preserve the last valid data.
        }
        return cached
      })().finally(() => {
        pending = undefined
      })
    }
    return pending.then((agents) => structuredClone(agents))
  }
  return {
    listAgents,
    getAgent: async (id) =>
      (await listAgents()).find((agent) => agent.id === id) ?? null,
    publishAgent: notImplemented('publishAgent'),
    deleteAgent: notImplemented('deleteAgent'),
    toggleStar: async (id, userId) => {
      const { toggleStarAgent } = await import('../services/firestore')
      return toggleStarAgent(id, userId)
    },
    // No per-page-view writes on Spark.
    recordView: async () => {},
  }
}

export const agentRepository: AgentRepository = createFirestoreAgentRepository()
