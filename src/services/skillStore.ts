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
import type {
  Firestore,
  QueryConstraint,
  Transaction,
} from 'firebase/firestore'
import type { SkillManifest, SkillRecord } from '../types/skill'
import { agentIdSchema } from '../lib/manifestSchema'
import { validateSkillRecord } from '../lib/skillSchema'
import { lintSkill } from '../lib/safetyLinter'
import type { Page } from './profiles'
import { compareVersions } from '../lib/semver'
import { markExportChange } from './firestore'

type ReviewStatus = SkillRecord['review_status']

export interface SkillStore {
  createSkill(manifest: SkillManifest): Promise<void>
  updateSkill(manifest: SkillManifest): Promise<{ staged: boolean }>
  setSkillVisibility(
    id: string,
    visibility: SkillManifest['visibility'],
  ): Promise<void>
  getSkillRecord(id: string): Promise<SkillRecord | null>
  listMySkills(pageSize: number, afterId?: string): Promise<Page<SkillRecord>>
  listSharedSkills(
    ownerUid: string,
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillReviewQueue(
    status: SkillRecord['review_status'],
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  reviewSkill(id: string, status: SkillRecord['review_status']): Promise<void>
  setSkillAuthorVerified(id: string, verified: boolean): Promise<void>
  getPendingSkillEdit(id: string): Promise<SkillRecord | null>
  withdrawPendingSkillEdit(id: string): Promise<void>
  listMyPendingSkillEdits(
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  listSkillEditQueue(
    status: 'pending' | 'rejected',
    pageSize: number,
    afterId?: string,
  ): Promise<Page<SkillRecord>>
  reviewSkillEdit(id: string, status: 'approved' | 'rejected'): Promise<void>
}

function checked(value: unknown, id: string): SkillRecord {
  const result = validateSkillRecord(value)
  if (!result.ok)
    throw new Error(
      result.issues.map((issue) => issue.path + ' ' + issue.code).join(', '),
    )
  if (result.value.id !== id) throw new Error('Skill id mismatch')
  return result.value
}
function checkSharing(record: SkillRecord) {
  if (
    record.visibility !== 'private' &&
    lintSkill(record).findings.some((f) => f.severity === 'block')
  )
    throw new Error('Blocked skill can only be saved privately')
  return record
}
export function createSkillStore(db: Firestore, uid: string): SkillStore {
  if (!uid || uid.includes('/')) throw new Error('Invalid user id')
  const ref = (id: string) => doc(db, 'skills', agentIdSchema.parse(id))
  const editRef = (id: string) =>
    doc(db, 'skill_edits', agentIdSchema.parse(id))
  const profile = doc(db, 'users', uid)
  // Snapshots have no client read/update access. First try an atomic create;
  // on an existing snapshot retry without writing it. Rules permit that retry
  // only when the complete approved record equals the immutable snapshot.
  async function approval(
    write: (tx: Transaction, snapshot: boolean) => Promise<void>,
  ) {
    try {
      await runTransaction(db, (tx) => write(tx, true))
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'permission-denied'
      ))
        throw error
      await runTransaction(db, (tx) => write(tx, false))
    }
  }
  function snapshot(tx: Transaction, next: SkillRecord, create: boolean) {
    if (create) {
      tx.set(doc(db, 'skill_versions', `${next.id}@${next.version}`), next)
      markExportChange(tx, db, 'skill_versions', `${next.id}@${next.version}`)
    }
  }
  function record(
    manifest: SkillManifest,
    identity: { handle: string; display_name: string },
    previous?: SkillRecord,
  ): SkillRecord {
    return checkSharing(
      checked(
        {
          ...manifest,
          author: {
            uid,
            name: identity.display_name,
            handle: identity.handle,
            verified: previous?.author.verified ?? false,
          },
          owner_uid: uid,
          review_status: 'pending',
          ...(previous?.saved_from_chat && { saved_from_chat: true }),
          ...(previous?.origin_app && { origin_app: previous.origin_app }),
          stats: {
            updated_at: new Date().toISOString(),
          },
        },
        manifest.id,
      ),
    )
  }
  async function write(
    id: string,
    change: (current: SkillRecord) => SkillManifest,
    content = false,
  ) {
    return runTransaction(db, async (tx) => {
      const [snapshot, person] = await Promise.all([
        tx.get(ref(id)),
        tx.get(profile),
      ])
      if (!snapshot.exists()) throw new Error('Skill does not exist')
      if (!person.exists()) throw new Error('Create your profile first')
      const current = checked(snapshot.data(), id)
      if (current.owner_uid !== uid)
        throw new Error('Only the owner can edit this skill')
      const changed = change(current)
      // Only an approved public skill can be pinned by users, so only its
      // edits need a new version. Drafts and private skills save freely.
      if (
        content &&
        current.visibility === 'public' &&
        current.review_status === 'approved' &&
        compareVersions(changed.version, current.version) <= 0
      )
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
        if (
          current.visibility === 'public' &&
          current.review_status === 'approved'
        )
          markExportChange(tx, db, 'skills', id)
      }
      return { staged }
    })
  }
  async function page(
    filters: QueryConstraint[],
    pageSize: number,
    afterId?: string,
    source = 'skills',
  ): Promise<Page<SkillRecord>> {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20)
      throw new Error('Page size must be 1 to 20')
    const constraints = [...filters, orderBy(documentId()), limit(pageSize)]
    if (afterId) constraints.push(startAfter(agentIdSchema.parse(afterId)))
    // Server reads fail closed offline; cached formerly-shared content is not returned.
    const snapshot = await getDocsFromServer(
      query(collection(db, source), ...constraints),
    )
    return {
      items: snapshot.docs.map((d) => checked(d.data(), d.id)),
      cursor: snapshot.docs.at(-1)?.id ?? null,
    }
  }
  return {
    async createSkill(manifest: SkillManifest): Promise<void> {
      await runTransaction(db, async (tx) => {
        const skillRef = ref(manifest.id)
        const [skill, person] = await Promise.all([
          tx.get(skillRef),
          tx.get(profile),
        ])
        if (skill.exists()) throw new Error('Skill id is taken')
        if (!person.exists()) throw new Error('Create your profile first')
        tx.set(
          skillRef,
          record(
            manifest,
            person.data() as { handle: string; display_name: string },
          ),
        )
      })
    },
    async updateSkill(manifest: SkillManifest): Promise<{ staged: boolean }> {
      return write(manifest.id, () => manifest, true)
    },
    async setSkillVisibility(
      id: string,
      visibility: SkillManifest['visibility'],
    ): Promise<void> {
      await write(id, (current) => ({ ...current, visibility }))
    },
    async getSkillRecord(id: string): Promise<SkillRecord | null> {
      const snapshot = await getDocFromServer(ref(id))
      return snapshot.exists() ? checked(snapshot.data(), id) : null
    },
    async listMySkills(
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<SkillRecord>> {
      return page([where('owner_uid', '==', uid)], pageSize, afterId)
    },
    async listSharedSkills(
      ownerUid: string,
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<SkillRecord>> {
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
    async listSkillReviewQueue(
      status: ReviewStatus = 'pending',
      pageSize = 20,
      afterId?: string,
    ): Promise<Page<SkillRecord>> {
      return page(
        [
          where('visibility', '==', 'public'),
          where('review_status', '==', status),
        ],
        pageSize,
        afterId,
      )
    },
    async reviewSkill(id: string, status: ReviewStatus): Promise<void> {
      await approval(async (tx, create) => {
        const live = await tx.get(ref(id))
        if (!live.exists()) throw new Error('Skill does not exist')
        if (status === 'approved')
          snapshot(
            tx,
            checked({ ...live.data(), review_status: status }, id),
            create,
          )
        tx.update(ref(id), { review_status: status })
        if (
          live.get('visibility') === 'public' &&
          (live.get('review_status') === 'approved' || status === 'approved')
        )
          markExportChange(tx, db, 'skills', id)
        if (live.data().visibility !== 'public' || status !== 'approved')
          tx.delete(editRef(id))
      })
    },
    async setSkillAuthorVerified(id: string, verified: boolean): Promise<void> {
      await runTransaction(db, async (tx) => {
        const live = await tx.get(ref(id))
        if (!live.exists()) throw new Error('Skill does not exist')
        tx.update(ref(id), { 'author.verified': verified })
        if (
          live.get('visibility') === 'public' &&
          live.get('review_status') === 'approved'
        )
          markExportChange(tx, db, 'skills', id)
      })
    },
    async getPendingSkillEdit(id: string): Promise<SkillRecord | null> {
      const snapshot = await getDocFromServer(editRef(id))
      return snapshot.exists() ? checked(snapshot.data(), id) : null
    },
    async withdrawPendingSkillEdit(id: string): Promise<void> {
      await deleteDoc(editRef(id))
    },
    async listMyPendingSkillEdits(pageSize = 20, afterId?: string) {
      return page(
        [where('owner_uid', '==', uid)],
        pageSize,
        afterId,
        'skill_edits',
      )
    },
    async listSkillEditQueue(
      status: 'pending' | 'rejected' = 'pending',
      pageSize = 20,
      afterId?: string,
    ) {
      return page(
        [where('review_status', '==', status)],
        pageSize,
        afterId,
        'skill_edits',
      )
    },
    async reviewSkillEdit(
      id: string,
      status: 'approved' | 'rejected',
    ): Promise<void> {
      if (status === 'rejected') {
        await updateDoc(editRef(id), { review_status: status })
        return
      }
      if (status !== 'approved') throw new Error('Invalid review status')
      await approval(async (tx, create) => {
        const [live, edit] = await Promise.all([
          tx.get(ref(id)),
          tx.get(editRef(id)),
        ])
        if (!live.exists() || !edit.exists())
          throw new Error('Skill or edit does not exist')
        const current = checked(live.data(), id)
        const proposed = checked(edit.data(), id)
        if (compareVersions(proposed.version, current.version) <= 0)
          throw new Error(
            'The edit version must be higher than the live version',
          )
        const next: SkillRecord = {
          ...proposed,
          review_status: 'approved',
          author: { ...proposed.author, verified: current.author.verified },
        }
        snapshot(tx, next, create)
        tx.set(ref(id), next)
        markExportChange(tx, db, 'skills', id)
        tx.delete(editRef(id))
      })
    },
  }
}
