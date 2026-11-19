import { Timestamp } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

// Each export source owns a coalescing queue. A receipt identifies the precise
// revision seen by this run, so a newer write survives acknowledgement.
export const sources = [
  'agents',
  'agent_versions',
  'skills',
  'skill_versions',
  'councils',
  'council_versions',
] as const
type Source = (typeof sources)[number]
export interface Receipt {
  source: Source
  id: string
  seconds: number
  nanos: number
}

export async function pendingChanges(db: Firestore, source: Source) {
  const snapshot = await db
    .collection(`export_sources/${source}/changes`)
    .select()
    .get()
  return snapshot.docs.map(({ id, updateTime }) => ({
    source,
    id,
    seconds: updateTime.seconds,
    nanos: updateTime.nanoseconds,
  }))
}

export async function acknowledge(db: Firestore, receipts: Receipt[]) {
  const writer = db.bulkWriter()
  const deletes = Promise.all(
    receipts.map(async ({ source, id, seconds, nanos }) => {
      if (!sources.includes(source) || !id || id.includes('/'))
        throw new Error('Invalid export receipt')
      const ref = db.collection(`export_sources/${source}/changes`).doc(id)
      try {
        await writer.delete(ref, {
          lastUpdateTime: new Timestamp(seconds, nanos),
        })
      } catch (error) {
        const code = (error as { code?: number }).code
        // Already consumed, or another commit changed the marker in flight.
        if (code !== 5 && code !== 9) throw error
      }
    }),
  )
  // close() flushes the final partial batch as well as pending retries.
  await Promise.all([deletes, writer.close()])
}
