import type { Firestore } from 'firebase/firestore'
import { castVote } from '../src/services/ratings'

/**
 * Casts an up vote, or retracts it when the user already voted up. Resolves to
 * the agent's new thumbs-up count. Stands in for the retired star toggle in
 * tests that only need a counter to move.
 */
export async function toggleUp(db: Firestore, agentId: string, userId: string) {
  return (await castVote(db, 'agent', agentId, userId, 'up')).thumbs_up
}
