import type { Relationship } from '@/services/profiles'

/** The fields the Friends page needs from a relationship record. */
export type RelationshipLink = Pick<
  Relationship,
  'uid' | 'sender_uid' | 'status'
>

export interface SplitRelationships {
  /** Pending requests other people sent to me. */
  incoming: RelationshipLink[]
  /** Pending requests I sent. */
  outgoing: RelationshipLink[]
  friends: RelationshipLink[]
}

/** Sorts my relationship records into the three lists the Friends page shows. */
export function splitRelationships(
  items: readonly RelationshipLink[],
  me: string,
): SplitRelationships {
  const split: SplitRelationships = { incoming: [], outgoing: [], friends: [] }
  for (const item of items) {
    if (item.status === 'accepted') split.friends.push(item)
    else if (item.sender_uid === me) split.outgoing.push(item)
    else split.incoming.push(item)
  }
  return split
}

export type PersonState = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none'

/** Where I stand with one person, from the lists already loaded. */
export function personState(
  uid: string,
  me: string,
  split: SplitRelationships,
): PersonState {
  if (uid === me) return 'self'
  if (split.friends.some((r) => r.uid === uid)) return 'friend'
  if (split.outgoing.some((r) => r.uid === uid)) return 'outgoing'
  if (split.incoming.some((r) => r.uid === uid)) return 'incoming'
  return 'none'
}

/** What stops this user from sending a request, in plain words, or null. */
export function sendBlocker(
  emailVerified: boolean,
  hasProfile: boolean,
): string | null {
  if (!emailVerified && !hasProfile)
    return 'To send friend requests, confirm your email and choose a username.'
  if (!emailVerified) return 'To send friend requests, confirm your email.'
  if (!hasProfile) return 'To send friend requests, choose a username.'
  return null
}
