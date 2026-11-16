import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  personState,
  sendBlocker,
  splitRelationships,
} from '../src/components/friends/relationships'

const me = 'me'
const links = [
  { uid: 'a', sender_uid: 'a', status: 'pending' as const },
  { uid: 'b', sender_uid: me, status: 'pending' as const },
  { uid: 'c', sender_uid: 'c', status: 'accepted' as const },
  { uid: 'd', sender_uid: me, status: 'accepted' as const },
]

test('relationships split into requests to me, requests I sent, and friends', () => {
  const split = splitRelationships(links, me)
  assert.deepEqual(
    split.incoming.map((r) => r.uid),
    ['a'],
  )
  assert.deepEqual(
    split.outgoing.map((r) => r.uid),
    ['b'],
  )
  // Mutual: who sent the original request no longer matters once accepted.
  assert.deepEqual(
    split.friends.map((r) => r.uid),
    ['c', 'd'],
  )
})

test('a search result knows where I stand with that person', () => {
  const split = splitRelationships(links, me)
  assert.equal(personState(me, me, split), 'self')
  assert.equal(personState('a', me, split), 'incoming')
  assert.equal(personState('b', me, split), 'outgoing')
  assert.equal(personState('c', me, split), 'friend')
  assert.equal(personState('z', me, split), 'none')
})

test('sending needs a confirmed email and a username, said plainly', () => {
  assert.equal(sendBlocker(true, true), null)
  assert.match(sendBlocker(false, true) ?? '', /confirm your email\.$/)
  assert.match(sendBlocker(true, false) ?? '', /choose a username\.$/)
  assert.match(
    sendBlocker(false, false) ?? '',
    /confirm your email and choose a username/,
  )
})
