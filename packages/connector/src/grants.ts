import { FirestoreError, type Firestore } from './firebase'
import { ABSOLUTE, IDLE } from './tokens'

export interface Grant {
  gen: number
  app: string
  name: string
  scopes: string
  created: Date
  refreshed: Date
}

export interface Grants {
  epoch: number
  grants: Record<string, Grant>
}

export const active = (grant: Grant | undefined, now: number): grant is Grant =>
  grant?.created instanceof Date &&
  grant.refreshed instanceof Date &&
  now < grant.created.getTime() / 1000 + ABSOLUTE &&
  now < grant.refreshed.getTime() / 1000 + IDLE

export async function readGrants(db: Firestore, uid: string) {
  const document = await db.get(`connector_grants/${uid}`)
  return {
    data: document
      ? (document.fields as unknown as Grants)
      : { epoch: 0, grants: {} },
    updateTime: document?.updateTime,
  }
}

export async function changeGrants<T>(
  db: Firestore,
  uid: string,
  change: (state: Grants) => { write: boolean; result: T },
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, updateTime } = await readGrants(db, uid)
    const { write, result } = change(data)
    if (!write) return result
    try {
      await db.put(`connector_grants/${uid}`, data, updateTime)
      return result
    } catch (error) {
      if (!(error instanceof FirestoreError && error.conflict) || attempt === 2)
        throw error
    }
  }
  throw new Error('Could not update the connection.')
}
