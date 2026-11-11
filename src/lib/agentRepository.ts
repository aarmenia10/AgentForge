import { SEED_AGENTS } from '@/data/seedAgents'
import type { AgentManifest } from '@/types/agent'

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

/**
 * TODO(codex): Firestore implementation.
 *   - collection: `agents`, document id = manifest.id
 *   - stars: `agents/{id}/stars/{userId}` plus an aggregated `stats.stars`
 *   - recordView: batched or sampled increments, never one write per view
 * Signature is fixed; fill in the body and swap the export below.
 */
export function createFirestoreAgentRepository(): AgentRepository {
  return {
    listAgents: notImplemented('listAgents'),
    getAgent: notImplemented('getAgent'),
    publishAgent: notImplemented('publishAgent'),
    deleteAgent: notImplemented('deleteAgent'),
    toggleStar: notImplemented('toggleStar'),
    recordView: notImplemented('recordView'),
  }
}

/** The repository the app uses. Swap here once Firestore lands. */
export const agentRepository: AgentRepository = seedAgentRepository
