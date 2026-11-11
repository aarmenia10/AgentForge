import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { getFirebaseServices } from '../lib/firebase'
import { agentIdSchema } from '../lib/validateManifest'

/** Exported separately so the real transaction can also run against the emulator. */
export async function toggleStarInFirestore(
  db: Firestore,
  agentId: string,
  userId: string,
): Promise<number> {
  agentIdSchema.parse(agentId)
  if (!userId || userId.includes('/')) throw new Error('Invalid user id')
  const agentRef = doc(db, 'agents', agentId)
  const starRef = doc(agentRef, 'stars', userId)
  for (let attempt = 0; ; attempt++) {
    let observed: { count: number; starred: boolean } | undefined
    try {
      return await runTransaction(db, async (transaction) => {
        // All reads precede writes; retries re-read both the count and this user's star.
        const agent = await transaction.get(agentRef)
        const star = await transaction.get(starRef)
        if (!agent.exists()) throw new Error(`Agent does not exist: ${agentId}`)
        const current: unknown = agent.get('stats.stars')
        if (
          typeof current !== 'number' ||
          !Number.isSafeInteger(current) ||
          current < 0
        )
          throw new Error('Invalid star count')
        const delta = star.exists() ? -1 : 1
        observed = { count: current, starred: star.exists() }
        if (current + delta < 0)
          throw new Error('Star count is inconsistent with star records')
        if (star.exists()) transaction.delete(starRef)
        else
          transaction.set(starRef, {
            user_id: userId,
            created_at: serverTimestamp(),
          })
        transaction.update(agentRef, { 'stats.stars': increment(delta) })
        return current + delta
      })
    } catch (error) {
      // Rules can reject a stale star transition before Firestore reports ABORTED.
      // Retry only when authorized reads prove the state changed under this attempt.
      if (
        attempt >= 2 ||
        !observed ||
        (error as { code?: string }).code !== 'permission-denied'
      )
        throw error
      const [latestAgent, latestStar] = await Promise.all([
        getDoc(agentRef),
        getDoc(starRef),
      ])
      if (
        !latestAgent.exists() ||
        (latestAgent.get('stats.stars') === observed.count &&
          latestStar.exists() === observed.starred)
      )
        throw error
    }
  }
}

export async function toggleStarAgent(
  agentId: string,
  userId: string,
): Promise<number> {
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser || auth.currentUser.uid !== userId)
    throw new Error('Sign in as the user whose star is being changed')
  return toggleStarInFirestore(db, agentId, userId)
}
