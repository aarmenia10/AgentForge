import {
  collection,
  deleteDoc,
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
import { compareVersions } from '../lib/semver'

export function createAgentStore(db: Firestore, uid: string) {
  if (!uid || uid.includes('/')) throw new Error('Invalid user id')
  const ref = (id: string) => doc(db, 'agents', agentIdSchema.parse(id))
  const editRef = (id: string) =>
    doc(db, 'agent_edits', agentIdSchema.parse(id))
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
    content = false,
  ) {
    return runTransaction(db, async (tx) => {
      const [snapshot, person] = await Promise.all([
        tx.get(ref(id)),
        tx.get(profile),
      ])
      if (!snapshot.exists()) throw new Error('Agent does not exist')
      if (!person.exists()) throw new Error('Create your profile first')
      const current = snapshot.data() as AgentRecord
      if (current.owner_uid !== uid)
        throw new Error('Only the owner can edit this agent')
      const changed = change(current)
      if (content && compareVersions(changed.version, current.version) <= 0)
        throw new Error('The edit version must be higher than the live version')
      const next = record(
        changed,
        person.data() as { handle: string; display_name: string },
        current,
      )
      const staged =
        content &&
        current.visibility === 'public' &&
        current.review_status === 'approved' &&
        next.visibility === 'public'
      if (staged) tx.set(editRef(id), next)
      else {
        // Visibility changes preserve the live content and happen immediately.
        tx.set(
          ref(id),
          content
            ? next
            : {
                ...current,
                visibility: changed.visibility,
                review_status: 'pending',
              },
        )
        tx.delete(editRef(id))
      }
      return { staged }
    })
  }
  async function page(
    filters: QueryConstraint[],
    pageSize: number,
    afterId?: string,
    source = 'agents',
  ): Promise<Page<AgentRecord>> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      throw new Error('Page size must be 1 to 50')
    const constraints = [...filters, orderBy(documentId()), limit(pageSize)]
    if (afterId) constraints.push(startAfter(agentIdSchema.parse(afterId)))
    // Server reads fail closed offline; cached formerly-shared content is not returned.
    const snapshot = await getDocsFromServer(
      query(collection(db, source), ...constraints),
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
    async updateAgent(manifest: AgentManifest): Promise<{ staged: boolean }> {
      return write(manifest.id, () => manifest, true)
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
      await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(ref(id))
        if (!snapshot.exists()) throw new Error('Agent does not exist')
        tx.update(ref(id), { review_status: status })
        if (snapshot.data().visibility !== 'public' || status !== 'approved')
          tx.delete(editRef(id))
      })
    },
    async setAuthorVerified(id: string, verified: boolean): Promise<void> {
      await updateDoc(ref(id), { 'author.verified': verified })
    },
    async getPendingEdit(id: string): Promise<AgentRecord | null> {
      const snapshot = await getDocFromServer(editRef(id))
      return snapshot.exists() ? (snapshot.data() as AgentRecord) : null
    },
    async withdrawPendingEdit(id: string): Promise<void> {
      await deleteDoc(editRef(id))
    },
    async listMyPendingEdits(pageSize = 20, afterId?: string) {
      return page(
        [where('owner_uid', '==', uid)],
        pageSize,
        afterId,
        'agent_edits',
      )
    },
    async listEditQueue(
      status: 'pending' | 'rejected' = 'pending',
      pageSize = 20,
      afterId?: string,
    ) {
      return page(
        [where('review_status', '==', status)],
        pageSize,
        afterId,
        'agent_edits',
      )
    },
    async reviewEdit(
      id: string,
      status: 'approved' | 'rejected',
    ): Promise<void> {
      if (status === 'rejected') {
        await updateDoc(editRef(id), { review_status: status })
        return
      }
      if (status !== 'approved') throw new Error('Invalid review status')
      await runTransaction(db, async (tx) => {
        const [live, edit] = await Promise.all([
          tx.get(ref(id)),
          tx.get(editRef(id)),
        ])
        if (!live.exists() || !edit.exists())
          throw new Error('Agent or edit does not exist')
        const current = live.data() as AgentRecord
        const proposed = edit.data() as AgentRecord
        tx.set(ref(id), {
          ...proposed,
          review_status: 'approved',
          author: { ...proposed.author, verified: current.author.verified },
          stats: {
            ...proposed.stats,
            stars: current.stats.stars,
            views: current.stats.views,
          },
        })
        tx.delete(editRef(id))
      })
    },
  }
}
