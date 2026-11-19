import {
  doc,
  getDoc,
  runTransaction,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore'

interface Grant {
  app: string
  name: string
  created: Timestamp
  refreshed: Timestamp
}
interface GrantState {
  epoch: number
  grants: Record<string, Grant>
}

export function createConnectorGrantStore(db: Firestore, uid: string) {
  const record = doc(db, 'connector_grants', uid)
  return {
    async list(now = Date.now()) {
      const found = await getDoc(record)
      const state = found.data() as GrantState | undefined
      const day = 86_400_000
      return Object.entries(state?.grants ?? {})
        .flatMap(([id, grant]) => {
          const created = grant?.created?.toMillis?.()
          const refreshed = grant?.refreshed?.toMillis?.()
          if (
            typeof created !== 'number' ||
            typeof refreshed !== 'number' ||
            now >= created + 90 * day ||
            now >= refreshed + 30 * day ||
            typeof grant.app !== 'string'
          )
            return []
          return [{ id, app: grant.app, refreshed }]
        })
        .sort((a, b) => b.refreshed - a.refreshed)
    },
    async disconnect(id?: string) {
      await runTransaction(db, async (tx) => {
        const found = await tx.get(record)
        const state = (found.data() as GrantState | undefined) ?? {
          epoch: 0,
          grants: {},
        }
        if (id === undefined)
          tx.set(record, { epoch: state.epoch + 1, grants: {} })
        else if (Object.hasOwn(state.grants, id)) {
          const grants = { ...state.grants }
          delete grants[id]
          tx.set(record, { epoch: state.epoch, grants })
        }
      })
    },
  }
}

export async function connectorGrantStore(uid: string) {
  const { getFirebaseServices } = await import('@/lib/firebase')
  return createConnectorGrantStore(getFirebaseServices().db, uid)
}
