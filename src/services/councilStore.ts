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
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type Firestore,
  type QueryConstraint,
  type Transaction,
} from 'firebase/firestore'
import { agentIdSchema } from '../lib/manifestSchema'
import { validateCouncilRecord } from '../lib/councilSchema'
import { compareVersions } from '../lib/semver'
import { formatItemRef } from '../lib/skillSchema'
import type { CouncilManifest, CouncilRecord } from '../types/council'
import type { ItemRef } from '../types/skill'
import { lintCouncil } from './councilSafety'

const liveSource = 'councils'
const editSource = 'council_edits'
type ReviewStatus = CouncilRecord['review_status']
type Source = typeof liveSource | typeof editSource
type CouncilInput = Omit<CouncilManifest, 'author' | 'stats'>
const isApproved = (record: CouncilRecord) =>
  record.visibility === 'public' && record.review_status === 'approved'

function checked(value: unknown, id: string) {
  const result = validateCouncilRecord(value)
  if (!result.ok)
    throw new Error(
      result.issues
        .map(({ path, message }) => path + ': ' + message)
        .join('\n'),
    )
  if (
    result.value.id !== id ||
    result.value.owner_uid !== result.value.author.uid
  )
    throw new Error('Council identity does not match.')
  return result.value
}
function requireShareable(council: CouncilRecord) {
  if (council.visibility === 'private') return
  const blocks = lintCouncil(council).findings.filter(
    ({ severity }) => severity === 'block',
  )
  if (blocks.length)
    throw new Error(
      'Resolve these blocked findings before sharing: ' +
        blocks.map(({ path }) => path).join(', '),
    )
}

export function createCouncilStore(db: Firestore, uid: string) {
  const ref = (source: Source, id: string) =>
    doc(db, source, agentIdSchema.parse(id))
  const memberRef = ({ kind, id }: ItemRef) =>
    doc(db, kind === 'agent' ? 'agents' : 'skills', id)
  const mark = (
    tx: Transaction,
    source: 'councils' | 'council_versions',
    id: string,
  ) =>
    tx.set(doc(db, 'export_sources', source, 'changes', id), {
      revision: crypto.randomUUID(),
      changed_at: serverTimestamp(),
    })
  const snapshot = (tx: Transaction, value: CouncilRecord) => {
    const pin = value.id + '@' + value.version
    tx.set(doc(db, 'council_versions', pin), value)
    mark(tx, 'council_versions', pin)
  }
  async function read(source: Source, id: string) {
    const value = await getDocFromServer(ref(source, id))
    return value.exists() ? checked(value.data(), id) : null
  }
  async function certify(
    council: CouncilRecord,
    mode: 'approval' | 'submission' | 'friends' | 'private',
  ) {
    if (mode === 'private' && council.members.length <= 8) return
    requireShareable(council)
    const groups = Array.from(
      { length: Math.ceil(council.members.length / 5) },
      (_, index) => index,
    )
    try {
      await Promise.all(
        groups.map((index) =>
          setDoc(
            doc(
              db,
              liveSource,
              council.id,
              'member_checks',
              uid,
              'groups',
              String(index),
            ),
            {
              owner_uid: council.owner_uid,
              members: council.members,
              mode,
              checked_at: serverTimestamp(),
            },
          ),
        ),
      )
    } catch (error) {
      if (
        (error as { code?: string }).code !== 'permission-denied' ||
        mode === 'private'
      )
        throw error
      throw new Error(
        mode === 'friends'
          ? 'Friends councils require approved public pins or your own friends-visible members. Confirm your email before sharing.'
          : mode === 'submission'
            ? 'Confirm your email and make each pinned member public or submit that version for review first.'
            : 'Every council member must be public and approved at its pinned version.',
        { cause: error },
      )
    }
  }
  async function ensureCurrentMembers(
    tx: Transaction,
    council: CouncilRecord,
    approving = false,
  ) {
    if (council.visibility === 'private') return
    await Promise.all(
      council.members.map(async ({ ref }) => {
        const member = await tx.get(memberRef(ref))
        const approved =
          member.get('visibility') === 'public' &&
          member.get('review_status') === 'approved'
        const currentPin = member.get('version') === ref.version
        const pending =
          council.visibility === 'public' &&
          !approving &&
          currentPin &&
          member.get('visibility') === 'public' &&
          member.get('review_status') === 'pending'
        const shared =
          council.visibility === 'friends' &&
          currentPin &&
          member.get('visibility') === 'friends' &&
          member.get('owner_uid') === council.owner_uid
        if (!approved && !pending && !shared)
          throw new Error('Council member unavailable: ' + formatItemRef(ref))
      }),
    )
  }
  async function write(
    id: string,
    input: CouncilInput | CouncilRecord['visibility'],
  ) {
    const current = await read(liveSource, id)
    if (!current || current.owner_uid !== uid)
      throw new Error('Only the owner can edit a council.')
    const content = typeof input !== 'string'
    const visibility = content ? input.visibility : input
    const pending = checked(
      {
        ...current,
        ...(content ? input : { visibility }),
        id,
        owner_uid: uid,
        author: current.author,
        review_status: 'pending',
        stats: content
          ? { updated_at: new Date().toISOString() }
          : current.stats,
      },
      id,
    )
    const publicLive = isApproved(current)
    if (
      !content &&
      current.visibility === visibility &&
      current.review_status !== 'rejected'
    )
      return { staged: false }
    if (
      content &&
      publicLive &&
      (visibility !== 'public' ||
        compareVersions(pending.version, current.version) <= 0)
    )
      throw new Error(
        'Propose a higher version for this public council, or change its visibility first.',
      )
    await certify(pending, visibility === 'public' ? 'submission' : visibility)
    const staged = content && publicLive
    await runTransaction(db, async (tx) => {
      const live = await tx.get(ref(liveSource, id))
      if (
        !live.exists() ||
        JSON.stringify(checked(live.data(), id)) !== JSON.stringify(current)
      )
        throw new Error('The council changed. Reload it before saving.')
      await ensureCurrentMembers(tx, pending)
      if (staged) tx.set(ref(editSource, id), pending)
      else {
        tx.set(ref(liveSource, id), pending)
        tx.delete(ref(editSource, id))
        if (publicLive) mark(tx, liveSource, id)
      }
    })
    return { staged }
  }
  async function page(
    source: Source,
    constraints: QueryConstraint[],
    afterId?: string,
  ) {
    const order = [orderBy(documentId()), limit(20)]
    const snapshot = await getDocsFromServer(
      query(
        collection(db, source),
        ...constraints,
        ...order,
        ...(afterId ? [startAfter(agentIdSchema.parse(afterId))] : []),
      ),
    )
    return {
      items: snapshot.docs.map((d) => checked(d.data(), d.id)),
      cursor: snapshot.size === 20 ? snapshot.docs.at(-1)!.id : null,
    }
  }
  return {
    get: (id: string) => read(liveSource, id),
    getEdit: (id: string) => read(editSource, id),
    withdraw: (id: string) => deleteDoc(ref(editSource, id)),
    listMine: (afterId?: string) =>
      page(liveSource, [where('owner_uid', '==', uid)], afterId),
    listShared: (owner: string, afterId?: string) =>
      page(
        liveSource,
        [where('owner_uid', '==', owner), where('visibility', '==', 'friends')],
        afterId,
      ),
    listReview: (status: ReviewStatus, edit: boolean, afterId?: string) =>
      page(
        edit ? editSource : liveSource,
        [
          where('review_status', '==', status),
          ...(edit ? [] : [where('visibility', '==', 'public')]),
        ],
        afterId,
      ),
    async memberStatus(ref: ItemRef) {
      const member = await getDocFromServer(memberRef(ref)).catch(
        (error: unknown) => {
          if ((error as { code?: string }).code === 'permission-denied')
            return null
          throw error
        },
      )
      if (!member?.exists()) return null
      const { name, author, visibility, review_status, version } = member.data()
      return {
        name: String(name),
        handle: String(author.handle),
        visibility: String(visibility),
        reviewStatus: String(review_status),
        version: String(version),
      }
    },
    async create(input: CouncilInput) {
      const person = await getDocFromServer(doc(db, 'users', uid))
      if (!person.exists())
        throw new Error('Choose your username before saving a council.')
      const value = checked(
        {
          ...input,
          visibility: 'private',
          owner_uid: uid,
          review_status: 'pending',
          author: {
            uid,
            name: person.get('display_name'),
            handle: person.get('handle'),
            verified: false,
          },
          stats: { updated_at: new Date().toISOString() },
        },
        input.id,
      )
      await certify(value, 'private')
      await runTransaction(db, async (tx) => {
        const target = ref(liveSource, input.id)
        if ((await tx.get(target)).exists())
          throw new Error('That council ID is taken.')
        tx.set(target, value)
      })
      return value.id
    },
    update: (input: CouncilInput) => write(input.id, input),
    setVisibility: (id: string, visibility: CouncilRecord['visibility']) =>
      write(id, visibility),
    async delete(id: string) {
      await runTransaction(db, async (tx) => {
        const target = ref(liveSource, id)
        const live = await tx.get(target)
        if (!live.exists()) throw new Error('Council does not exist.')
        const current = checked(live.data(), id)
        if (current.owner_uid !== uid)
          throw new Error('Only the owner can delete a council.')
        tx.delete(target)
        tx.delete(ref(editSource, id))
        if (isApproved(current)) mark(tx, liveSource, id)
      })
    },

    async verifyAuthor(id: string, verified: boolean) {
      await runTransaction(db, async (tx) => {
        const target = ref(liveSource, id)
        const current = checked((await tx.get(target)).data(), id)
        if (current.author.verified === verified) return
        tx.update(target, { 'author.verified': verified })
        if (isApproved(current)) mark(tx, liveSource, id)
      })
    },
    async review(id: string, status: 'approved' | 'rejected', edit: boolean) {
      if (edit && status === 'rejected') {
        await updateDoc(ref(editSource, id), { review_status: status })
        return
      }
      const candidate = await read(edit ? editSource : liveSource, id)
      if (!candidate) throw new Error('Council submission no longer exists.')
      if (!edit && candidate.review_status === status) return
      if (status === 'approved') await certify(candidate, 'approval')
      async function review(createSnapshot: boolean) {
        await runTransaction(db, async (tx) => {
          const liveDoc = await tx.get(ref(liveSource, id))
          const editDoc = edit ? await tx.get(ref(editSource, id)) : undefined
          const current = checked(liveDoc.data(), id)
          const reviewed = checked(
            editDoc ? editDoc.data() : liveDoc.data(),
            id,
          )
          if (JSON.stringify(reviewed) !== JSON.stringify(candidate))
            throw new Error(
              'This submission changed. Reload it before reviewing.',
            )
          if (edit && compareVersions(reviewed.version, current.version) <= 0)
            throw new Error(
              'The edit version must be higher than the approved version.',
            )
          if (status === 'approved')
            await ensureCurrentMembers(tx, reviewed, true)
          const next = {
            ...reviewed,
            review_status: status,
            author: { ...reviewed.author, verified: current.author.verified },
          }
          if (createSnapshot && status === 'approved') snapshot(tx, next)
          tx.set(ref(liveSource, id), next)
          if (status === 'approved' || isApproved(current))
            mark(tx, liveSource, id)
          if (edit || status === 'rejected') tx.delete(ref(editSource, id))
        })
      }
      try {
        await review(true)
      } catch (error) {
        if (
          status !== 'approved' ||
          (error as { code?: string }).code !== 'permission-denied'
        )
          throw error
        await review(false)
      }
    },
  }
}

export async function councilStore() {
  const { getFirebaseServices } = await import('../lib/firebase')
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to access your councils.')
  return createCouncilStore(db, auth.currentUser.uid)
}
