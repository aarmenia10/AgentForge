import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { createProfileStore } from '../src/services/profileStore'

test('profiles, handle claims, and mutual relationships enforce ownership and atomicity', async (t) => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentforge',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  await env.clearFirestore()
  const alice = env
    .authenticatedContext('alice', { email_verified: true })
    .firestore()
  const bob = env
    .authenticatedContext('bob', { email_verified: true })
    .firestore()
  const charlie = env
    .authenticatedContext('charlie', { email_verified: false })
    .firestore()
  const stranger = env
    .authenticatedContext('stranger', { email_verified: true })
    .firestore()
  const anon = env.unauthenticatedContext().firestore()
  const a = createProfileStore(alice, 'alice')
  const b = createProfileStore(bob, 'bob')
  const c = createProfileStore(charlie, 'charlie')
  const input = (handle: string) => ({
    handle,
    display_name: 'Test User',
    avatar_url: null,
  })
  const pending = {
    sender_uid: 'alice',
    status: 'pending',
    created_at: serverTimestamp(),
  }
  try {
    await t.test(
      'own profile creation atomically reserves a handle; reads and searches are bounded',
      async () => {
        await assertSucceeds(a.createProfile(input('alice-user')))
        await assertSucceeds(b.createProfile(input('bob-user')))
        await assertSucceeds(c.createProfile(input('charlie-user')))
        assert.equal((await b.getProfileByHandle('alice-user'))?.uid, 'alice')
        assert.equal(
          (await a.searchProfiles('alice', 1)).items[0].handle,
          'alice-user',
        )
        assert.equal(
          (await a.searchProfiles('alice', 1, 'alice-user')).items.length,
          0,
        )
        await assertSucceeds(getDoc(doc(alice, 'handles', 'missing-user')))
        await assertFails(getDoc(doc(anon, 'users', 'alice')))
        await assertFails(getDoc(doc(anon, 'handles', 'alice-user')))
        await assertFails(getDocs(query(collection(anon, 'users'), limit(10))))
        await assertFails(getDocs(collection(alice, 'users')))
        await assertFails(getDocs(query(collection(alice, 'users'), limit(51))))
        await assertFails(
          getDocs(query(collection(alice, 'handles'), limit(10))),
        )
      },
    )
    await t.test(
      'taken, reserved, malformed, and orphan claims are denied by rules',
      async () => {
        for (const handle of [
          'alice-user',
          'agentforge',
          'admin',
          'support',
          'UPPER',
          '-bad',
          'ab',
          'a'.repeat(31),
        ]) {
          const batch = writeBatch(stranger)
          batch.set(doc(stranger, 'users', 'stranger'), {
            ...input(handle),
            created_at: serverTimestamp(),
          })
          batch.set(doc(stranger, 'handles', handle), { uid: 'stranger' })
          await assertFails(batch.commit())
        }
        await assertFails(
          setDoc(doc(stranger, 'users', 'stranger'), {
            ...input('stranger-user'),
            created_at: serverTimestamp(),
          }),
        )
        await assertFails(
          setDoc(doc(stranger, 'handles', 'orphan-user'), { uid: 'stranger' }),
        )
        await assertFails(
          setDoc(doc(bob, 'handles', 'alice-user'), { uid: 'bob' }),
        )
        await assertFails(deleteDoc(doc(alice, 'handles', 'alice-user')))
        await assertFails(deleteDoc(doc(bob, 'handles', 'alice-user')))
      },
    )
    await t.test(
      'profile edits are owned and immutable creation time is protected; handle changes are atomic',
      async () => {
        await assertSucceeds(
          a.updateProfile({
            display_name: 'Alice',
            avatar_url: 'https://example.com/a.png',
          }),
        )
        await assertFails(
          updateDoc(doc(bob, 'users', 'alice'), { display_name: 'forged' }),
        )
        await assertFails(
          updateDoc(doc(alice, 'users', 'alice'), {
            created_at: serverTimestamp(),
          }),
        )
        await assertFails(
          updateDoc(doc(alice, 'users', 'alice'), {
            email: 'extra@example.com',
          }),
        )
        await assertFails(
          updateDoc(doc(alice, 'users', 'alice'), {
            avatar_url: 'http://example.com/a.png',
          }),
        )
        await assertFails(
          updateDoc(doc(alice, 'users', 'alice'), { display_name: '' }),
        )
        await assertFails(
          updateDoc(doc(alice, 'users', 'alice'), { handle: 'new-alice' }),
        )
        await assertFails(deleteDoc(doc(alice, 'users', 'alice')))
        await assertSucceeds(a.updateProfile({ handle: 'new-alice' }))
        assert.equal(
          (await getDoc(doc(alice, 'handles', 'alice-user'))).exists(),
          false,
        )
        assert.equal((await a.getProfileByHandle('new-alice'))?.uid, 'alice')
        const stolen = writeBatch(bob)
        stolen.update(doc(bob, 'users', 'bob'), { handle: 'new-alice' })
        stolen.set(doc(bob, 'handles', 'new-alice'), { uid: 'bob' })
        stolen.delete(doc(bob, 'handles', 'bob-user'))
        await assertFails(stolen.commit())
      },
    )
    await t.test(
      'a verified sender creates both pending copies; neither sender nor outsider can accept',
      async () => {
        await assertFails(c.sendFriendRequest('bob'))
        await assertFails(
          setDoc(doc(anon, 'users/alice/relationships/bob'), pending),
        )
        await assert.rejects(a.sendFriendRequest('alice'), /yourself/)
        await assertFails(a.sendFriendRequest('missing'))
        await assertFails(
          setDoc(doc(alice, 'users/alice/relationships/bob'), pending),
        )
        await assertFails(
          setDoc(doc(alice, 'users/alice/relationships/alice'), pending),
        )
        for (const override of [
          { sender_uid: 'bob' },
          { extra: true },
          { created_at: null },
        ]) {
          const bad = writeBatch(alice)
          for (const path of [
            'users/alice/relationships/bob',
            'users/bob/relationships/alice',
          ])
            bad.set(doc(alice, path), { ...pending, ...override })
          await assertFails(bad.commit())
        }
        const forged = writeBatch(alice)
        for (const path of [
          'users/alice/relationships/bob',
          'users/bob/relationships/alice',
        ])
          forged.set(doc(alice, path), { ...pending, status: 'accepted' })
        await assertFails(forged.commit())
        await assertSucceeds(a.sendFriendRequest('bob'))
        assert.equal((await b.getRelationship('alice'))?.sender_uid, 'alice')
        assert.equal((await a.listRelationships('pending', 1)).items.length, 1)
        assert.equal(
          (await a.listRelationships('pending', 1, 'bob')).items.length,
          0,
        )
        const selfAccept = writeBatch(alice)
        for (const path of [
          'users/alice/relationships/bob',
          'users/bob/relationships/alice',
        ])
          selfAccept.update(doc(alice, path), { status: 'accepted' })
        await assertFails(selfAccept.commit())
        await assertFails(
          updateDoc(doc(bob, 'users/bob/relationships/alice'), {
            status: 'accepted',
          }),
        )
        await assertFails(
          createProfileStore(stranger, 'alice').acceptFriendRequest('bob'),
        )
        await assertFails(b.sendFriendRequest('alice'))
        await assertSucceeds(b.acceptFriendRequest('alice'))
        assert.equal((await a.getRelationship('bob'))?.status, 'accepted')
        assert.equal(
          (await a.listRelationships('accepted')).items[0].uid,
          'bob',
        )
        await assertFails(a.sendFriendRequest('bob'))
      },
    )
    await t.test(
      'relationships cannot be forged, observed by third parties, or edited beyond acceptance',
      async () => {
        await assertFails(getDoc(doc(bob, 'users/alice/relationships/bob')))
        await assertFails(
          getDocs(
            query(collection(stranger, 'users/alice/relationships'), limit(10)),
          ),
        )
        await assertFails(
          getDocs(
            query(collection(anon, 'users/alice/relationships'), limit(10)),
          ),
        )
        await assertFails(
          getDocs(collection(alice, 'users/alice/relationships')),
        )
        await assertFails(
          getDocs(
            query(collection(alice, 'users/alice/relationships'), limit(51)),
          ),
        )
        await assertFails(
          updateDoc(doc(alice, 'users/alice/relationships/bob'), {
            sender_uid: 'bob',
          }),
        )
        await assertFails(
          updateDoc(doc(bob, 'users/bob/relationships/alice'), {
            status: 'pending',
          }),
        )
        await assertFails(
          deleteDoc(doc(alice, 'users/alice/relationships/bob')),
        )
        const outsider = writeBatch(stranger)
        outsider.delete(doc(stranger, 'users/alice/relationships/bob'))
        outsider.delete(doc(stranger, 'users/bob/relationships/alice'))
        await assertFails(outsider.commit())
      },
    )
    await t.test(
      'either user removes friendship; either side can cancel or decline a pending request',
      async () => {
        await assertSucceeds(a.removeFriendship('bob'))
        assert.equal(await b.getRelationship('alice'), null)
        await a.sendFriendRequest('bob')
        await assertSucceeds(b.removeFriendship('alice'))
        await a.sendFriendRequest('bob')
        await assertSucceeds(a.removeFriendship('bob'))
        await a.sendFriendRequest('bob')
        await b.acceptFriendRequest('alice')
        await assertSucceeds(b.removeFriendship('alice'))
        await assertSucceeds(b.sendFriendRequest('charlie'))
        // Verification is required to SEND, not to accept or decline.
        await assertSucceeds(c.acceptFriendRequest('bob'))
        await assertSucceeds(c.removeFriendship('bob'))
      },
    )
  } finally {
    await env.cleanup()
  }
})
