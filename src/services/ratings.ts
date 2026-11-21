import type { Firestore } from 'firebase/firestore'
import { agentIdSchema } from '../lib/manifestSchema'
import {
  fetchRatings,
  hasBlockedWord,
  type ItemKind,
  type RatingComment,
  type RatingData,
} from '../lib/blockedWords'

export { fetchRatings, type ItemKind, type RatingComment, type RatingData }

async function fs() {
  return import('firebase/firestore')
}

export type VoteValue = 'up' | 'down'

export interface VoteResult {
  thumbs_up: number
  thumbs_down: number
  userVote: VoteValue | null
}

export interface ItemReport {
  userId: string
  reason: 'spam' | 'harmful' | 'misleading' | 'other'
  note: string | null
  created_at?: string
  updated_at?: string
}

export interface ReportedItemSummary {
  kind: ItemKind
  id: string
  count: number
  reasons: Record<string, number>
  reports: ItemReport[]
}

function collectionName(kind: ItemKind): 'agents' | 'skills' {
  return kind === 'agent' ? 'agents' : 'skills'
}

function exportMarkerId(kind: ItemKind, itemId: string): string {
  return `${collectionName(kind)}_${itemId}`
}

/**
 * Casts, switches, or retracts a vote on an agent or skill.
 * If the user votes for the value they already hold, the vote is retracted.
 * For agents: existing star documents count as thumbs up and are deleted
 * atomically when a vote is cast, keeping stats.stars consistent.
 */
export async function castVote(
  db: Firestore,
  kind: ItemKind,
  itemId: string,
  userId: string,
  value: VoteValue,
): Promise<VoteResult> {
  agentIdSchema.parse(itemId)
  if (!userId || userId.includes('/')) throw new Error('Invalid user id')

  const { doc, runTransaction, increment, serverTimestamp } = await fs()
  const col = collectionName(kind)
  const itemRef = doc(db, col, itemId)
  const voteRef = doc(itemRef, 'votes', userId)
  const starRef = kind === 'agent' ? doc(itemRef, 'stars', userId) : null

  // What the last attempt read. Rules can reject a stale transition with
  // permission-denied before Firestore reports ABORTED (two tabs voting at
  // once), so a denial is retried only when fresh reads prove the state moved.
  let observed: { counts: string; vote: unknown; star: boolean } | undefined
  const counts = (snap: { get(field: string): unknown }) =>
    JSON.stringify([
      snap.get('stats.stars'),
      snap.get('stats.thumbs_up'),
      snap.get('stats.thumbs_down'),
    ])
  const attempt = () =>
    runTransaction(db, async (tx) => {
      const itemSnap = await tx.get(itemRef)
      if (!itemSnap.exists())
        throw new Error(`${kind} does not exist: ${itemId}`)

      const voteSnap = await tx.get(voteRef)
      const starSnap = starRef ? await tx.get(starRef) : null
      observed = {
        counts: counts(itemSnap),
        vote: voteSnap.exists() ? voteSnap.get('value') : null,
        star: starSnap ? starSnap.exists() : false,
      }

      const hadStar = starSnap ? starSnap.exists() : false
      const hadVote = voteSnap.exists()
      const rawVote = hadVote ? (voteSnap.get('value') as VoteValue) : null
      const oldVal: VoteValue | null = rawVote ?? (hadStar ? 'up' : null)

      const isRetraction = oldVal === value
      const newVal: VoteValue | null = isRetraction ? null : value

      if (isRetraction) {
        tx.delete(voteRef)
      } else {
        tx.set(voteRef, {
          value: newVal,
          created_at: hadVote ? voteSnap.get('created_at') : serverTimestamp(),
          updated_at: serverTimestamp(),
        })
      }

      if (hadStar && starRef) {
        tx.delete(starRef)
      }

      let nextThumbsUp: number
      let nextThumbsDown: number

      if (kind === 'agent') {
        const currentStars = (itemSnap.get('stats.stars') as number) ?? 0
        const oldIsUp = oldVal === 'up'
        const newIsUp = newVal === 'up'
        const delta = (newIsUp ? 1 : 0) - (oldIsUp ? 1 : 0)
        nextThumbsUp = Math.max(0, currentStars + delta)
        nextThumbsDown = 0 // agents store stars only

        if (delta !== 0) {
          tx.update(itemRef, { 'stats.stars': increment(delta) })
        }
      } else {
        const currentUp = (itemSnap.get('stats.thumbs_up') as number) ?? 0
        const currentDown = (itemSnap.get('stats.thumbs_down') as number) ?? 0
        const upDelta = (newVal === 'up' ? 1 : 0) - (oldVal === 'up' ? 1 : 0)
        const downDelta =
          (newVal === 'down' ? 1 : 0) - (oldVal === 'down' ? 1 : 0)
        nextThumbsUp = Math.max(0, currentUp + upDelta)
        nextThumbsDown = Math.max(0, currentDown + downDelta)

        const updates: Record<string, unknown> = {}
        if (upDelta !== 0) updates['stats.thumbs_up'] = increment(upDelta)
        if (downDelta !== 0) updates['stats.thumbs_down'] = increment(downDelta)
        if (Object.keys(updates).length > 0) {
          tx.update(itemRef, updates)
        }
      }

      if (
        itemSnap.get('visibility') === 'public' &&
        itemSnap.get('review_status') === 'approved'
      ) {
        tx.set(
          doc(
            db,
            'export_sources',
            'votes',
            'changes',
            exportMarkerId(kind, itemId),
          ),
          { revision: crypto.randomUUID() },
        )
      }

      return {
        thumbs_up: nextThumbsUp,
        thumbs_down: nextThumbsDown,
        userVote: newVal,
      }
    })

  for (let tries = 0; ; tries++) {
    try {
      return await attempt()
    } catch (error) {
      if (
        tries >= 2 ||
        !observed ||
        (error as { code?: string }).code !== 'permission-denied'
      )
        throw error
      const { getDoc } = await fs()
      const [item, vote, star] = await Promise.all([
        getDoc(itemRef),
        getDoc(voteRef),
        starRef ? getDoc(starRef) : null,
      ])
      if (
        !item.exists() ||
        (counts(item) === observed.counts &&
          (vote.exists() ? vote.get('value') : null) === observed.vote &&
          (star ? star.exists() : false) === observed.star)
      )
        throw error
    }
  }
}

/**
 * Reads the current signed-in user's vote. For agents, returns 'up' if an
 * existing star document is found.
 */
export async function readUserVote(
  db: Firestore,
  kind: ItemKind,
  itemId: string,
  userId: string,
): Promise<VoteValue | null> {
  const { doc, getDoc } = await fs()
  const col = collectionName(kind)
  const voteSnap = await getDoc(doc(db, col, itemId, 'votes', userId))
  if (voteSnap.exists()) {
    const val = voteSnap.get('value')
    if (val === 'up' || val === 'down') return val
  }
  if (kind === 'agent') {
    const starSnap = await getDoc(doc(db, 'agents', itemId, 'stars', userId))
    if (starSnap.exists()) return 'up'
  }
  return null
}

/**
 * Posts a comment to Firestore. Validates blocked words in the browser first.
 */
export async function postComment(
  db: Firestore,
  kind: ItemKind,
  itemId: string,
  body: string,
  user: { uid: string; handle: string },
): Promise<RatingComment> {
  agentIdSchema.parse(itemId)
  const trimmed = body.trim()
  if (!trimmed || trimmed.length > 1000) {
    throw new Error('Comment must be between 1 and 1,000 characters.')
  }
  if (hasBlockedWord(trimmed)) {
    throw new Error(
      'Your comment contains a word that is not allowed. Please edit it before posting.',
    )
  }

  const { doc, getDoc, collection, serverTimestamp, writeBatch } = await fs()
  const col = collectionName(kind)
  const itemSnap = await getDoc(doc(db, col, itemId))
  if (!itemSnap.exists()) throw new Error(`${kind} does not exist: ${itemId}`)

  const batch = writeBatch(db)
  const commentRef = doc(collection(db, col, itemId, 'comments'))
  batch.set(commentRef, {
    author_uid: user.uid,
    author_handle: user.handle,
    body: trimmed,
    created_at: serverTimestamp(),
    deleted: false,
  })

  if (
    itemSnap.get('visibility') === 'public' &&
    itemSnap.get('review_status') === 'approved'
  ) {
    const markerRef = doc(
      db,
      'export_sources',
      'comments',
      'changes',
      exportMarkerId(kind, itemId),
    )
    batch.set(markerRef, { revision: crypto.randomUUID() })
  }

  await batch.commit()

  return {
    id: commentRef.id,
    author_handle: user.handle,
    body: trimmed,
    created_at: new Date().toISOString(),
  }
}

/**
 * Soft-deletes a comment (deleted: true). Allowed for author and admins.
 */
export async function deleteComment(
  db: Firestore,
  kind: ItemKind,
  itemId: string,
  commentId: string,
): Promise<void> {
  const { doc, getDoc, writeBatch } = await fs()
  const col = collectionName(kind)
  const itemSnap = await getDoc(doc(db, col, itemId))

  const batch = writeBatch(db)
  const commentRef = doc(db, col, itemId, 'comments', commentId)
  batch.update(commentRef, { deleted: true })

  if (
    itemSnap.exists() &&
    itemSnap.get('visibility') === 'public' &&
    itemSnap.get('review_status') === 'approved'
  ) {
    const markerRef = doc(
      db,
      'export_sources',
      'comments',
      'changes',
      exportMarkerId(kind, itemId),
    )
    batch.set(markerRef, { revision: crypto.randomUUID() })
  }

  await batch.commit()
}

/**
 * Submits or updates an item-level report.
 */
export async function submitReport(
  db: Firestore,
  kind: ItemKind,
  itemId: string,
  userId: string,
  report: {
    reason: 'spam' | 'harmful' | 'misleading' | 'other'
    note?: string | null
    target_type?: 'item' | 'comment'
    target_id?: string
  },
): Promise<void> {
  const { doc, getDoc, setDoc, serverTimestamp } = await fs()
  const col = collectionName(kind)
  const reportRef = doc(db, col, itemId, 'reports', userId)
  const existing = await getDoc(reportRef)
  const note = report.note ? report.note.trim().slice(0, 500) : null

  if (existing.exists()) {
    await setDoc(reportRef, {
      reason: report.reason,
      note,
      created_at: existing.get('created_at'),
      updated_at: serverTimestamp(),
    })
  } else {
    await setDoc(reportRef, {
      reason: report.reason,
      note,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  }
}

/**
 * Fetches reports across all items for admin moderation view. Bounded query.
 */
export async function listReports(
  db: Firestore,
  pageSize = 50,
): Promise<ReportedItemSummary[]> {
  const { collectionGroup, query, limit, getDocs } = await fs()
  const q = query(collectionGroup(db, 'reports'), limit(pageSize))
  const snap = await getDocs(q)
  const byItem = new Map<string, ReportedItemSummary>()

  for (const docSnap of snap.docs) {
    const parentItemRef = docSnap.ref.parent.parent
    if (!parentItemRef) continue
    const kind: ItemKind =
      parentItemRef.parent.id === 'agents' ? 'agent' : 'skill'
    const id = parentItemRef.id
    const key = `${kind}:${id}`

    let item = byItem.get(key)
    if (!item) {
      item = {
        kind,
        id,
        count: 0,
        reasons: { spam: 0, harmful: 0, misleading: 0, other: 0 },
        reports: [],
      }
      byItem.set(key, item)
    }

    const data = docSnap.data()
    const reason =
      (data.reason as 'spam' | 'harmful' | 'misleading' | 'other') || 'other'
    item.count += 1
    item.reasons[reason] = (item.reasons[reason] || 0) + 1
    item.reports.push({
      userId: docSnap.id,
      reason,
      note: data.note || null,
      created_at: data.created_at?.toDate
        ? data.created_at.toDate().toISOString()
        : undefined,
      updated_at: data.updated_at?.toDate
        ? data.updated_at.toDate().toISOString()
        : undefined,
    })
  }

  return [...byItem.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, pageSize)
}

/**
 * Net score (thumbs_up minus thumbs_down) sort comparator per docs/RATINGS.md §7.
 */
export function topRatedSort<
  T extends {
    thumbs_up?: number
    thumbs_down?: number
    stats?: { stars?: number; updated_at?: string }
    updated_at?: string
  },
>(a: T, b: T): number {
  const aUp = a.thumbs_up ?? a.stats?.stars ?? 0
  const aDown = a.thumbs_down ?? 0
  const bUp = b.thumbs_up ?? b.stats?.stars ?? 0
  const bDown = b.thumbs_down ?? 0
  const aNet = aUp - aDown
  const bNet = bUp - bDown
  if (aNet !== bNet) return bNet - aNet
  if (aUp !== bUp) return bUp - aUp
  const aDate = Date.parse(a.updated_at ?? a.stats?.updated_at ?? '') || 0
  const bDate = Date.parse(b.updated_at ?? b.stats?.updated_at ?? '') || 0
  return bDate - aDate
}
