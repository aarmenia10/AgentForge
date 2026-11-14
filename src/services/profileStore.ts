import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { Firestore, QueryConstraint } from 'firebase/firestore'
import { validHandle } from './profiles'
import type { Page, ProfileInput, Relationship, UserProfile } from './profiles'

function uidPath(uid: string) {
  if (!uid || uid.includes('/')) throw new Error('Invalid user id')
  return uid
}
function pageLimit(size: number) {
  if (!Number.isInteger(size) || size < 1 || size > 50)
    throw new Error('Page size must be 1 to 50')
  return limit(size)
}
function checkInput(input: ProfileInput) {
  if (!validHandle(input.handle)) throw new Error('Invalid or reserved handle')
  if (!input.display_name.trim() || input.display_name.length > 100)
    throw new Error('Display name must be 1 to 100 characters')
  if (
    input.avatar_url !== null &&
    (!/^https:\/\//.test(input.avatar_url) || input.avatar_url.length > 2048)
  )
    throw new Error('Avatar URL must use HTTPS')
}

/** SDK-backed store; the public facade imports it only after a user action. */
export function createProfileStore(db: Firestore, uid: string) {
  uidPath(uid)
  const profileRef = doc(db, 'users', uid)
  const relationshipRef = (owner: string, other: string) =>
    doc(db, 'users', uidPath(owner), 'relationships', uidPath(other))
  const pair = (other: string) => {
    if (other === uid) throw new Error('Cannot friend yourself')
    return [relationshipRef(uid, other), relationshipRef(other, uid)] as const
  }
  return {
    async createProfile(input: ProfileInput): Promise<void> {
      checkInput(input)
      await runTransaction(db, async (tx) => {
        const handleRef = doc(db, 'handles', input.handle)
        const [profile, handle] = await Promise.all([
          tx.get(profileRef),
          tx.get(handleRef),
        ])
        if (profile.exists()) throw new Error('Profile already exists')
        if (handle.exists()) throw new Error('Handle is taken')
        tx.set(profileRef, { ...input, created_at: serverTimestamp() })
        tx.set(handleRef, { uid })
      })
    },
    async updateProfile(input: Partial<ProfileInput>): Promise<void> {
      await runTransaction(db, async (tx) => {
        const current = await tx.get(profileRef)
        if (!current.exists()) throw new Error('Create your profile first')
        const next = { ...current.data(), ...input } as ProfileInput
        checkInput(next)
        const oldHandle = current.get('handle') as string
        if (next.handle !== oldHandle) {
          const newRef = doc(db, 'handles', next.handle)
          if ((await tx.get(newRef)).exists())
            throw new Error('Handle is taken')
          tx.set(newRef, { uid })
          tx.delete(doc(db, 'handles', oldHandle))
        }
        tx.update(profileRef, { ...input })
      })
    },
    async getProfile(other: string): Promise<UserProfile | null> {
      const result = await getDoc(doc(db, 'users', uidPath(other)))
      return result.exists()
        ? ({ ...result.data(), uid: result.id } as UserProfile)
        : null
    },
    async getProfileByHandle(handle: string): Promise<UserProfile | null> {
      if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle))
        throw new Error('Invalid handle')
      const claim = await getDoc(doc(db, 'handles', handle))
      return claim.exists() ? this.getProfile(claim.get('uid') as string) : null
    },
    async searchProfiles(
      prefix: string,
      pageSize = 20,
      afterHandle?: string,
    ): Promise<Page<UserProfile>> {
      if (!/^[a-z0-9-]{1,30}$/.test(prefix))
        throw new Error('Enter a lowercase handle prefix')
      const constraints: QueryConstraint[] = [
        where('handle', '>=', prefix),
        where('handle', '<=', prefix + '\uf8ff'),
        orderBy('handle'),
        pageLimit(pageSize),
      ]
      if (afterHandle) constraints.push(startAfter(afterHandle))
      const result = await getDocs(
        query(collection(db, 'users'), ...constraints),
      )
      return {
        items: result.docs.map(
          (d) => ({ ...d.data(), uid: d.id }) as UserProfile,
        ),
        cursor: (result.docs.at(-1)?.get('handle') as string) ?? null,
      }
    },
    async sendFriendRequest(other: string): Promise<void> {
      const refs = pair(other)
      const batch = writeBatch(db)
      const data = {
        sender_uid: uid,
        status: 'pending',
        created_at: serverTimestamp(),
      }
      for (const ref of refs) batch.set(ref, data)
      await batch.commit()
    },
    async acceptFriendRequest(other: string): Promise<void> {
      const refs = pair(other)
      await runTransaction(db, async (tx) => {
        const request = await tx.get(refs[0])
        if (
          !request.exists() ||
          request.get('status') !== 'pending' ||
          request.get('sender_uid') === uid
        )
          throw new Error('No incoming friend request')
        for (const ref of refs) tx.update(ref, { status: 'accepted' })
      })
    },
    async removeFriendship(other: string): Promise<void> {
      const refs = pair(other)
      const batch = writeBatch(db)
      for (const ref of refs) batch.delete(ref)
      await batch.commit()
    },
    async getRelationship(other: string): Promise<Relationship | null> {
      const result = await getDoc(relationshipRef(uid, other))
      return result.exists()
        ? ({ ...result.data(), uid: result.id } as Relationship)
        : null
    },
    async listRelationships(
      status?: Relationship['status'],
      pageSize = 50,
      afterUid?: string,
    ): Promise<Page<Relationship>> {
      const constraints: QueryConstraint[] = [
        orderBy(documentId()),
        pageLimit(pageSize),
      ]
      if (status) constraints.push(where('status', '==', status))
      if (afterUid) constraints.push(startAfter(uidPath(afterUid)))
      const result = await getDocs(
        query(collection(db, 'users', uid, 'relationships'), ...constraints),
      )
      return {
        items: result.docs.map(
          (d) => ({ ...d.data(), uid: d.id }) as Relationship,
        ),
        cursor: result.docs.at(-1)?.id ?? null,
      }
    },
  }
}
