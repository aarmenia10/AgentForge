import type { Timestamp } from 'firebase/firestore'

export interface UserProfile {
  uid: string
  handle: string
  display_name: string
  avatar_url: string | null
  created_at: Timestamp
}
export interface ProfileInput {
  handle: string
  display_name: string
  avatar_url: string | null
}
export interface Relationship {
  uid: string
  sender_uid: string
  status: 'pending' | 'accepted'
  created_at: Timestamp
}
export interface Page<T> {
  items: T[]
  cursor: string | null
}
export const RESERVED_HANDLES = ['agentforge', 'admin', 'support'] as const
export function validHandle(handle: string): boolean {
  return (
    /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(handle) &&
    !RESERVED_HANDLES.some((reserved) => reserved === handle)
  )
}
async function store() {
  const [{ getFirebaseServices }, { createProfileStore }] = await Promise.all([
    import('../lib/firebase'),
    import('./profileStore'),
  ])
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to use profiles and friends')
  return createProfileStore(db, auth.currentUser.uid)
}
export async function createProfile(input: ProfileInput) {
  return (await store()).createProfile(input)
}
export async function updateProfile(input: Partial<ProfileInput>) {
  return (await store()).updateProfile(input)
}
export async function getProfile(uid: string) {
  return (await store()).getProfile(uid)
}
export async function getProfileByHandle(handle: string) {
  return (await store()).getProfileByHandle(handle)
}
export async function searchProfiles(
  prefix: string,
  pageSize = 20,
  afterHandle?: string,
) {
  return (await store()).searchProfiles(prefix, pageSize, afterHandle)
}
export async function sendFriendRequest(uid: string) {
  return (await store()).sendFriendRequest(uid)
}
export async function acceptFriendRequest(uid: string) {
  return (await store()).acceptFriendRequest(uid)
}
/** Also cancels an outgoing request or declines an incoming request. */
export async function removeFriendship(uid: string) {
  return (await store()).removeFriendship(uid)
}
export async function getRelationship(uid: string) {
  return (await store()).getRelationship(uid)
}
export async function listRelationships(
  status?: Relationship['status'],
  pageSize = 50,
  afterUid?: string,
) {
  return (await store()).listRelationships(status, pageSize, afterUid)
}
