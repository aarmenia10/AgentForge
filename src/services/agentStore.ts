import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Firestore, QueryConstraint } from 'firebase/firestore'
import type { AgentManifest, AgentRecord } from '../types/agent'
import { agentIdSchema, validateAgentRecord } from '../lib/validateManifest'
import type { Page } from './profiles'
import type { ReviewStatus } from './agents'

export function createAgentStore(db: Firestore, uid: string) {
  if (!uid || uid.includes('/')) throw new Error('Invalid user id')
  const ref = (id: string) => doc(db, 'agents', agentIdSchema.parse(id))
  const profile = doc(db, 'users', uid)
  function record(
    manifest: AgentManifest,
    identity: { handle: string; display_name: string },
    previous?: AgentRecord,
  ): AgentRecord {
    return validateAgentRecord({
      ...manifest,
      author: {
        uid,
        name: identity.display_name,
        handle: identity.handle,
        verified: previous?.author.verified ?? false,
      },
      owner_uid: uid,
      shared_with: [],
      review_status: 'pending',
      stats: {
        stars: previous?.stats.stars ?? 0,
        views: previous?.stats.views ?? 0,
        updated_at: new Date().toISOString(),
      },
    })
  }
  async function write(
    id: string,
    change: (current: AgentRecord) => AgentManifest,
  ) {
    await runTransaction(db, async (tx) => {
      const [snapshot, person] = await Promise.all([
        tx.get(ref(id)),
        tx.get(profile),
      ])
      if (!snapshot.exists()) throw new Error('Agent does not exist')
      if (!person.exists()) throw new Error('Create your profile first')
      const current = snapshot.data() as AgentRecord
      if (current.owner_uid !== uid)
        throw new Error('Only the owner can edit this agent')
      const next = record(
        change(current),
        person.data() as { handle: string; display_name: string },
        current,
      )
      tx.set(ref(id), next)
    })
  }
  async function page(
    filters: QueryConstraint[],
    pageSize: number,
    afterId?: string,
  ): Promise<Page<AgentRecord>> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      throw new Error('Page size must be 1 to 50')
    const constraints = [...filters, orderBy(documentId()), limit(pageSize)]
    if (afterId) constraints.push(startAfter(agentIdSchema.parse(afterId)))
    // Server reads fail closed offline; cached formerly-shared content is not returned.
    const snapshot = await getDocsFromServer(
      query(collection(db, 'agents'), ...constraints),
    )
    return {
      items: snapshot.docs.map((d) => d.data() as AgentRecord),
      cursor: snapshot.docs.at(-1)?.id ?? null,
    }
  }
  return {
    async createAgent(manifest: AgentManifest): Promise<void> {
      await runTransaction(db, async (tx) => {
        const agentRef = ref(manifest.id)
        const [agent, person] = await Promise.all([
          tx.get(agentRef),
          tx.get(profile),
        ])
        if (agent.exists()) throw new Error('Agent id is taken')
        if (!person.exists()) throw new Error('Create your profile first')
        tx.set(
          agentRef,
          record(
            manifest,
            person.data() as { handle: string; display_name: string },
          ),
        )
      })
    },
    async updateAgent(manifest: AgentManifest): Promise<void> {
      await write(manifest.id, () => manifest)
    },
    async setAgentVisibility(
      id: string,
      visibility: AgentManifest['visibility'],
    ): Promise<void> {
      await write(id, (current) => ({ ...current, visibility }))
    },
    async getAgentRecord(id: string): Promise<AgentRecord | null> {
      const snapshot = await getDocFromServer(ref(id))
      return snapshot.exists() ? (snapshot.data() as AgentRecord) : null
    },
    async listMyAgents(
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<AgentRecord>> {
      return page([where('owner_uid', '==', uid)], pageSize, afterId)
    },
    async listSharedAgents(
      ownerUid: string,
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<AgentRecord>> {
      if (!ownerUid || ownerUid.includes('/'))
        throw new Error('Invalid owner uid')
      return page(
        [
          where('owner_uid', '==', ownerUid),
          where('visibility', '==', 'friends'),
        ],
        pageSize,
        afterId,
      )
    },
    async isCurrentUserAdmin(): Promise<boolean> {
      return (await getDocFromServer(doc(db, 'admins', uid))).exists()
    },
    async listReviewQueue(
      status: ReviewStatus = 'pending',
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<AgentRecord>> {
      return page(
        [
          where('visibility', '==', 'public'),
          where('review_status', '==', status),
        ],
        pageSize,
        afterId,
      )
    },
    async reviewAgent(id: string, status: ReviewStatus): Promise<void> {
      await updateDoc(ref(id), { review_status: status })
    },
    async setAuthorVerified(id: string, verified: boolean): Promise<void> {
      await updateDoc(ref(id), { 'author.verified': verified })
    },
  }
}
