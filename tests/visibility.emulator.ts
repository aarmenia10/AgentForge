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
  getDocFromServer,
  getDocsFromServer,
  increment,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import type { AgentRecord } from '../src/types/agent'
import { createAgentStore } from '../src/services/agentStore'
import { createProfileStore } from '../src/services/profileStore'
import { toggleStarInFirestore } from '../src/services/firestore'

test('visibility, review, admin authority, bounded views, and star rules', async (t) => {
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
  const admin = env
    .authenticatedContext('admin-user', { email_verified: true })
    .firestore()
  const anon = env.unauthenticatedContext().firestore()
  const a = createAgentStore(alice, 'alice')
  const b = createAgentStore(bob, 'bob')
  const moderation = createAgentStore(admin, 'admin-user')
  const friendsA = createProfileStore(alice, 'alice')
  const friendsB = createProfileStore(bob, 'bob')
  const manifest = (
    id: string,
    visibility: AgentRecord['visibility'] = 'private',
  ) => ({ ...structuredClone(SEED_AGENTS[0]), id, visibility })
  const raw = (
    id: string,
    visibility: AgentRecord['visibility'] = 'private',
    uid = 'alice',
  ): AgentRecord => ({
    ...manifest(id, visibility),
    author: { uid, name: uid, handle: uid + '-user', verified: false },
    stats: { stars: 0, views: 0, updated_at: new Date().toISOString() },
    owner_uid: uid,
    shared_with: [],
    review_status: 'pending',
  })
  try {
    for (const [db, uid] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [charlie, 'charlie'],
      [admin, 'admin-user'],
    ] as const) {
      await createProfileStore(db, uid).createProfile({
        handle: uid + '-user',
        display_name: uid,
        avatar_url: null,
      })
    }
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'admins/admin-user'), {
        role: 'admin',
      })
    })

    await t.test(
      'verified owners create private, friends, and pending public agents; clients cannot forge identity or authority',
      async () => {
        for (const visibility of ['private', 'friends', 'public'] as const)
          await assertSucceeds(
            a.createAgent(manifest('alice-' + visibility, visibility)),
          )
        await assertSucceeds(a.createAgent(manifest('alice-private-two')))
        const created = await a.getAgentRecord('alice-public')
        assert.equal(created?.review_status, 'pending')
        assert.equal(created?.author.verified, false)
        assert.equal(created?.author.uid, 'alice')
        assert.equal(created?.author.handle, 'alice-user')
        assert.equal(created?.stats.stars, 0)
        await assertFails(
          createAgentStore(charlie, 'charlie').createAgent(
            manifest('unverified-agent'),
          ),
        )
        await env.withSecurityRulesDisabled(async (context) => {
          await setDoc(
            doc(context.firestore(), 'agents/charlie-private'),
            raw('charlie-private', 'private', 'charlie'),
          )
        })
        const unverifiedOwner = createAgentStore(charlie, 'charlie')
        await assertSucceeds(unverifiedOwner.getAgentRecord('charlie-private'))
        await assertFails(
          unverifiedOwner.setAgentVisibility('charlie-private', 'public'),
        )
        const verifiedCharlie = env
          .authenticatedContext('charlie', { email_verified: true })
          .firestore()
        await assertSucceeds(
          createAgentStore(verifiedCharlie, 'charlie').setAgentVisibility(
            'charlie-private',
            'friends',
          ),
        )
        await assertFails(
          setDoc(doc(anon, 'agents/anon-agent'), raw('anon-agent')),
        )
        const base = raw('forged-agent')
        for (const data of [
          { ...base, owner_uid: 'bob' },
          { ...base, author: { ...base.author, uid: 'bob' } },
          { ...base, author: { ...base.author, handle: 'bob-user' } },
          { ...base, author: { ...base.author, verified: true } },
          { ...base, review_status: 'approved' },
          { ...base, review_status: 'rejected' },
          { ...base, stats: { ...base.stats, stars: 100 } },
          { ...base, stats: { ...base.stats, views: 100 } },
          { ...base, shared_with: ['bob'] },
          { ...base, schema_version: 1 },
          { ...base, visibility: 'anyone' },
          { ...base, extra: 'field' },
          { ...base, id: 'different-id' },
          { ...base, author: { ...base.author, github: 'old' } },
          { ...base, stats: { ...base.stats, stars: 0.5 } },
          { ...base, author: { ...base.author, verified: 'true' } },
          { ...base, prompt_blueprint: {} },
        ])
          await assertFails(setDoc(doc(alice, 'agents/forged-agent'), data))
        await assertFails(
          setDoc(doc(admin, 'agents/admin-forged'), {
            ...raw('admin-forged', 'public', 'admin-user'),
            review_status: 'approved',
          }),
        )
        await assertFails(deleteDoc(doc(alice, 'agents/alice-private')))
      },
    )
    await t.test(
      'private records are owner-only, pending public records require owner or admin, and approved public records are readable',
      async () => {
        await assertSucceeds(a.getAgentRecord('alice-private'))
        await assertFails(b.getAgentRecord('alice-private'))
        await assertFails(moderation.getAgentRecord('alice-private'))
        await assertFails(getDocFromServer(doc(anon, 'agents/alice-private')))
        await assertFails(b.getAgentRecord('alice-public'))
        await assertFails(getDocFromServer(doc(anon, 'agents/alice-public')))
        await assertSucceeds(moderation.getAgentRecord('alice-public'))
        await assertSucceeds(moderation.reviewAgent('alice-public', 'approved'))
        await assertSucceeds(b.getAgentRecord('alice-public'))
        await assertSucceeds(getDocFromServer(doc(anon, 'agents/alice-public')))
        await assertSucceeds(
          getDocsFromServer(
            query(
              collection(anon, 'agents'),
              where('visibility', '==', 'public'),
              where('review_status', '==', 'approved'),
              limit(10),
            ),
          ),
        )
        await moderation.reviewAgent('alice-public', 'rejected')
        await assertFails(b.getAgentRecord('alice-public'))
        await assertSucceeds(a.getAgentRecord('alice-public'))
        await assertSucceeds(moderation.listReviewQueue('rejected'))
        await moderation.reviewAgent('alice-public', 'approved')
      },
    )
    await t.test(
      'only current accepted friends read friends agents; stale shared_with never grants access',
      async () => {
        await assertFails(b.getAgentRecord('alice-friends'))
        await assertFails(getDocFromServer(doc(anon, 'agents/alice-friends')))
        await assertFails(moderation.getAgentRecord('alice-friends'))
        await friendsA.sendFriendRequest('bob')
        await assertFails(b.getAgentRecord('alice-friends'))
        await friendsB.acceptFriendRequest('alice')
        await assertSucceeds(b.getAgentRecord('alice-friends'))
        await env.withSecurityRulesDisabled(async (context) => {
          await updateDoc(doc(context.firestore(), 'agents/alice-friends'), {
            shared_with: ['bob', 'charlie'],
          })
        })
        await assertFails(
          createAgentStore(charlie, 'charlie').getAgentRecord('alice-friends'),
        )
        await assertSucceeds(b.getAgentRecord('alice-friends'))
        await assertSucceeds(friendsB.removeFriendship('alice'))
        // No agent writes or client cleanup occur between removal and these server reads.
        await assertFails(b.getAgentRecord('alice-friends'))
        await assertFails(b.listSharedAgents('alice'))
        await assertSucceeds(a.getAgentRecord('alice-friends'))
        await friendsA.sendFriendRequest('bob')
        await friendsB.acceptFriendRequest('alice')
        await assertSucceeds(b.getAgentRecord('alice-friends'))
      },
    )
    await t.test(
      'all view queries are bounded, authorized and cursor-paginated',
      async () => {
        const first = await a.listMyAgents(1)
        assert.equal(first.items.length, 1)
        const next = await a.listMyAgents(1, first.cursor!)
        assert.equal(next.items.length, 1)
        assert.notEqual(first.items[0].id, next.items[0].id)
        assert.equal((await a.listMyAgents()).items.length, 4)
        assert.deepEqual(
          (await b.listSharedAgents('alice', 1)).items.map((agent) => agent.id),
          ['alice-friends'],
        )
        assert.equal(
          (await b.listSharedAgents('alice', 1, 'alice-friends')).items.length,
          0,
        )
        await assertFails(
          createAgentStore(charlie, 'charlie').listSharedAgents('alice'),
        )
        await assertFails(
          getDocsFromServer(
            query(
              collection(bob, 'agents'),
              where('owner_uid', '==', 'alice'),
              limit(50),
            ),
          ),
        )
        await assertFails(
          getDocsFromServer(
            query(
              collection(alice, 'agents'),
              where('owner_uid', '==', 'alice'),
            ),
          ),
        )
        await assertFails(
          getDocsFromServer(
            query(
              collection(alice, 'agents'),
              where('owner_uid', '==', 'alice'),
              limit(51),
            ),
          ),
        )
        await assertFails(
          getDocsFromServer(query(collection(alice, 'agents'), limit(10))),
        )
        await assertFails(getDocsFromServer(collection(alice, 'agents')))
        await assertFails(
          getDocsFromServer(query(collection(anon, 'agents'), limit(10))),
        )
        await assertFails(b.listReviewQueue())
        await assertSucceeds(moderation.listReviewQueue('approved', 1))
        await assertSucceeds(moderation.listReviewQueue('pending', 1))
        await assertFails(
          getDocsFromServer(
            query(
              collection(admin, 'agents'),
              where('visibility', '==', 'public'),
              where('review_status', '==', 'pending'),
            ),
          ),
        )
        await assertFails(
          getDocsFromServer(query(collection(admin, 'agents'), limit(50))),
        )
        await assert.rejects(a.listMyAgents(0), /Page size/)
        await assert.rejects(a.listMyAgents(51), /Page size/)
      },
    )
    await t.test(
      'owners cannot self-approve, self-verify, transfer ownership, forge counters or retain approval while editing',
      async () => {
        const path = doc(alice, 'agents/alice-public')
        await assertFails(updateDoc(path, { review_status: 'approved' }))
        await assertFails(updateDoc(path, { review_status: 'rejected' }))
        await assertFails(updateDoc(path, { 'author.verified': true }))
        await assertFails(
          updateDoc(path, { owner_uid: 'bob', review_status: 'pending' }),
        )
        await assertFails(
          updateDoc(path, { 'author.uid': 'bob', review_status: 'pending' }),
        )
        await assertFails(
          updateDoc(path, { 'stats.stars': 50, review_status: 'pending' }),
        )
        await assertFails(
          updateDoc(path, { 'stats.views': 50, review_status: 'pending' }),
        )
        await assertFails(updateDoc(path, { name: 'unreviewed edits' }))
        await assertFails(updateDoc(path, { visibility: 'private' }))
        await assertFails(
          updateDoc(doc(bob, 'agents/alice-public'), {
            review_status: 'pending',
          }),
        )
        await assertSucceeds(updateDoc(path, { review_status: 'pending' }))
        await assertFails(b.getAgentRecord('alice-public'))
        await assertSucceeds(
          a.updateAgent({
            ...manifest('alice-public', 'public'),
            name: 'edited',
          }),
        )
        await assertFails(
          createAgentStore(charlie, 'alice').updateAgent(
            manifest('alice-public', 'public'),
          ),
        )
        await moderation.reviewAgent('alice-public', 'approved')
        await moderation.setAuthorVerified('alice-public', true)
        await assertSucceeds(a.setAgentVisibility('alice-public', 'private'))
        assert.equal(
          (await a.getAgentRecord('alice-public'))?.review_status,
          'pending',
        )
        assert.equal(
          (await a.getAgentRecord('alice-public'))?.author.verified,
          true,
        )
        await assertFails(b.getAgentRecord('alice-public'))
        await assertSucceeds(a.setAgentVisibility('alice-public', 'friends'))
        await assertSucceeds(b.getAgentRecord('alice-public'))
        await assertSucceeds(a.setAgentVisibility('alice-public', 'public'))
        await assertFails(b.getAgentRecord('alice-public'))
        await moderation.reviewAgent('alice-public', 'approved')
        await assertFails(
          updateDoc(path, {
            'author.verified': false,
            review_status: 'pending',
          }),
        )
      },
    )
    await t.test(
      'admin membership is trusted-only; admins can change review and verification but cannot edit other fields',
      async () => {
        assert.equal(await moderation.isCurrentUserAdmin(), true)
        assert.equal(await a.isCurrentUserAdmin(), false)
        await assertFails(getDocFromServer(doc(anon, 'admins/admin-user')))
        for (const db of [alice, admin, anon]) {
          await assertFails(setDoc(doc(db, 'admins/forged'), { role: 'admin' }))
          await assertFails(
            updateDoc(doc(db, 'admins/admin-user'), { role: 'owner' }),
          )
          await assertFails(deleteDoc(doc(db, 'admins/admin-user')))
        }
        await assertFails(getDocFromServer(doc(alice, 'admins/admin-user')))
        await assertFails(
          getDocsFromServer(query(collection(admin, 'admins'), limit(10))),
        )
        await assertSucceeds(moderation.reviewAgent('alice-public', 'rejected'))
        await assertSucceeds(moderation.reviewAgent('alice-public', 'pending'))
        await assertSucceeds(moderation.reviewAgent('alice-public', 'approved'))
        await assertSucceeds(
          moderation.setAuthorVerified('alice-public', false),
        )
        await assertSucceeds(moderation.setAuthorVerified('alice-public', true))
        await assertSucceeds(
          moderation.createAgent(manifest('admin-pending', 'public')),
        )
        await assertFails(
          updateDoc(doc(admin, 'agents/alice-public'), {
            review_status: 'unknown',
          }),
        )
        await assertFails(
          updateDoc(doc(admin, 'agents/alice-public'), {
            'author.verified': 'yes',
          }),
        )
        await assertFails(
          updateDoc(doc(admin, 'agents/alice-public'), {
            name: 'edited by admin',
          }),
        )
        await assertFails(
          updateDoc(doc(admin, 'agents/alice-public'), {
            owner_uid: 'admin-user',
          }),
        )
        await assertFails(
          updateDoc(doc(admin, 'agents/alice-public'), {
            'stats.stars': increment(1),
          }),
        )
        await assertFails(deleteDoc(doc(admin, 'agents/alice-public')))
      },
    )
    await t.test(
      'atomic stars remain valid; unreadable agents and forged aggregate changes are denied',
      async () => {
        assert.equal(await toggleStarInFirestore(bob, 'alice-public', 'bob'), 1)
        assert.equal(await toggleStarInFirestore(bob, 'alice-public', 'bob'), 0)
        assert.equal(
          await toggleStarInFirestore(bob, 'alice-friends', 'bob'),
          1,
        )
        await assertFails(toggleStarInFirestore(bob, 'alice-private', 'bob'))
        assert.equal(
          await toggleStarInFirestore(alice, 'alice-private', 'alice'),
          1,
        )
        assert.equal(
          await toggleStarInFirestore(alice, 'alice-private', 'alice'),
          0,
        )
        await assertFails(
          getDocsFromServer(
            query(collection(bob, 'agents/alice-public/stars'), limit(10)),
          ),
        )
        await assertFails(toggleStarInFirestore(anon, 'alice-public', 'anon'))
        await assertFails(
          updateDoc(doc(bob, 'agents/alice-public'), {
            'stats.stars': increment(1),
          }),
        )
        await assertFails(
          setDoc(doc(bob, 'agents/alice-public/stars/bob'), {
            user_id: 'bob',
            created_at: serverTimestamp(),
          }),
        )
        const bad = writeBatch(bob)
        bad.set(doc(bob, 'agents/alice-public/stars/bob'), {
          user_id: 'bob',
          created_at: serverTimestamp(),
        })
        bad.update(doc(bob, 'agents/alice-public'), {
          'stats.stars': increment(10),
        })
        await assertFails(bad.commit())
        const hidden = writeBatch(bob)
        hidden.set(doc(bob, 'agents/alice-private/stars/bob'), {
          user_id: 'bob',
          created_at: serverTimestamp(),
        })
        hidden.update(doc(bob, 'agents/alice-private'), {
          'stats.stars': increment(1),
        })
        await assertFails(hidden.commit())
        await friendsA.removeFriendship('bob')
        await assertFails(
          getDocFromServer(doc(bob, 'agents/alice-friends/stars/bob')),
        )
        await assertFails(toggleStarInFirestore(bob, 'alice-friends', 'bob'))
        const revoked = writeBatch(bob)
        revoked.delete(doc(bob, 'agents/alice-friends/stars/bob'))
        revoked.update(doc(bob, 'agents/alice-friends'), {
          'stats.stars': increment(-1),
        })
        await assertFails(revoked.commit())
        assert.equal((await a.getAgentRecord('alice-friends'))?.stats.stars, 1)
      },
    )
  } finally {
    await env.cleanup()
  }
})
