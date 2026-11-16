import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  limit,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createAgentStore } from '../src/services/agentStore'
import { createProfileStore } from '../src/services/profileStore'
import { toggleStarInFirestore } from '../src/services/firestore'
import type { AgentRecord } from '../src/types/agent'

test('versioned edits and self-approval enforce atomic, exact promotion', async (t) => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentforge',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const db = (uid: string, verified = true) =>
    env.authenticatedContext(uid, { email_verified: verified }).firestore()
  const ownerDb = db('alice'),
    adminDb = db('reviewer'),
    otherDb = db('bob')
  const owner = createAgentStore(ownerDb, 'alice'),
    admin = createAgentStore(adminDb, 'reviewer'),
    other = createAgentStore(otherDb, 'bob')
  const id = 'versioned-agent'
  const manifest = { ...SEED_AGENTS[0], id, version: '1.0.0' }
  const proposed = { ...manifest, version: '2.0.0', name: 'Proposed content' }
  const liveRef = doc(ownerDb, 'agents', id),
    editRef = doc(ownerDb, 'agent_edits', id)
  const config = async (value?: boolean) =>
    env.withSecurityRulesDisabled(async (c) => {
      const ref = doc(c.firestore(), 'config/review')
      if (value === undefined) await deleteDoc(ref)
      else await setDoc(ref, { allow_self_approval: value })
    })
  try {
    await env.clearFirestore()
    for (const [uid, firestore] of [
      ['alice', ownerDb],
      ['reviewer', adminDb],
      ['bob', otherDb],
    ] as const)
      await createProfileStore(firestore, uid).createProfile({
        handle: uid + '-user',
        display_name: uid,
        avatar_url: null,
      })
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'admins/reviewer'), {})
      await setDoc(doc(c.firestore(), 'users/alice/relationships/bob'), {
        status: 'accepted',
      })
    })
    await owner.createAgent(manifest)
    await admin.reviewAgent(id, 'approved')
    await admin.setAuthorVerified(id, true)

    await t.test(
      'staging preserves live content; only verified owners create or replace a pending, distinct version',
      async () => {
        const live = await owner.getAgentRecord(id)
        assert.deepEqual(await owner.updateAgent(proposed), { staged: true })
        assert.deepEqual(await owner.getAgentRecord(id), live)
        const edit = (await owner.getPendingEdit(id))!
        assert.equal(edit.review_status, 'pending')
        await assertSucceeds(
          setDoc(editRef, { ...edit, description: 'Replaced proposal' }),
        )
        for (const patch of [
          { review_status: 'approved' },
          { review_status: 'rejected' },
          { version: '1.0.0' },
          { owner_uid: 'bob' },
          { unused: true },
          { visibility: 'private' },
          { author: { ...edit.author, verified: false } },
          { stats: { ...edit.stats, stars: 7 } },
        ])
          await assertFails(setDoc(editRef, { ...edit, ...patch }))
        await assertFails(setDoc(doc(otherDb, 'agent_edits', id), edit))
        await assertFails(
          setDoc(doc(db('alice', false), 'agent_edits', id), edit),
        )
        await assertFails(setDoc(doc(adminDb, 'agent_edits', id), edit))
        await assertFails(
          setDoc(doc(ownerDb, 'agent_edits/missing-agent'), {
            ...edit,
            id: 'missing-agent',
          }),
        )
        await assertFails(
          updateDoc(liveRef, { name: 'Direct edit', review_status: 'pending' }),
        )
        for (const version of ['1.0.0', '0.9.0', '1.0.0+build', '1.0.0-rc.1'])
          await assert.rejects(
            owner.updateAgent({ ...proposed, version }),
            /higher/,
          )
      },
    )

    await t.test(
      'edits are private to owner and admins, and lists enforce bounds and cursors',
      async () => {
        await assertFails(other.getPendingEdit(id))
        await assertFails(
          createAgentStore(
            env.unauthenticatedContext().firestore(),
            'anon',
          ).getPendingEdit(id),
        )
        await assertSucceeds(admin.getPendingEdit(id))
        assert.equal((await owner.listMyPendingEdits(1)).items.length, 1)
        assert.equal((await owner.listMyPendingEdits(1, id)).cursor, null)
        assert.equal((await admin.listEditQueue('pending', 1)).items.length, 1)
        await assertFails(other.listEditQueue())
        for (const size of [0, 51, 1.5]) {
          await assert.rejects(owner.listMyPendingEdits(size), /Page size/)
          await assert.rejects(
            admin.listEditQueue('pending', size),
            /Page size/,
          )
        }
        await assertFails(getDocsFromServer(collection(adminDb, 'agent_edits')))
        await assertFails(
          getDocsFromServer(
            query(collection(adminDb, 'agent_edits'), limit(51)),
          ),
        )
        await assertFails(
          getDocsFromServer(
            query(collection(otherDb, 'agent_edits'), limit(10)),
          ),
        )
      },
    )

    await t.test(
      'rejection changes only status, keeps live content intact, and owner can replace or withdraw it',
      async () => {
        const before = await owner.getAgentRecord(id)
        await assertFails(owner.reviewEdit(id, 'approved'))
        await assertFails(owner.reviewEdit(id, 'rejected'))
        await assertFails(
          updateDoc(doc(adminDb, 'agent_edits', id), {
            name: 'Forged rejection',
            review_status: 'rejected',
          }),
        )
        await admin.reviewEdit(id, 'rejected')
        assert.equal(
          (await owner.getPendingEdit(id))?.review_status,
          'rejected',
        )
        assert.deepEqual(await owner.getAgentRecord(id), before)
        assert.equal((await admin.listEditQueue('rejected')).items.length, 1)
        await assertFails(
          createAgentStore(db('alice', false), 'alice').withdrawPendingEdit(id),
        )
        await assertFails(other.withdrawPendingEdit(id))
        await assertFails(admin.withdrawPendingEdit(id))
        await owner.withdrawPendingEdit(id)
        assert.equal(await owner.getPendingEdit(id), null)
        await owner.updateAgent(proposed)
        assert.equal((await owner.getPendingEdit(id))?.review_status, 'pending')
      },
    )

    await t.test(
      'approval requires exact edit content and deletion in the same atomic batch',
      async () => {
        await toggleStarInFirestore(otherDb, id, 'bob')
        const edit = (await admin.getPendingEdit(id))!
        const live = (await admin.getAgentRecord(id))!
        const promoted: AgentRecord = {
          ...edit,
          review_status: 'approved',
          author: { ...edit.author, verified: live.author.verified },
          stats: {
            ...edit.stats,
            stars: live.stats.stars,
            views: live.stats.views,
          },
        }
        await assertFails(setDoc(doc(adminDb, 'agents', id), promoted))
        for (const patch of [
          { name: 'Injected by admin' },
          { description: 'Injected description' },
          { version: '9.0.0' },
          { owner_uid: 'reviewer' },
          { author: { ...promoted.author, verified: false } },
          { stats: { ...promoted.stats, stars: 0 } },
          {
            stats: {
              ...promoted.stats,
              updated_at: '2020-01-01T00:00:00.000Z',
            },
          },
        ]) {
          const batch = writeBatch(adminDb)
          batch.set(doc(adminDb, 'agents', id), { ...promoted, ...patch })
          batch.delete(doc(adminDb, 'agent_edits', id))
          await assertFails(batch.commit())
        }
        await admin.reviewEdit(id, 'approved')
        const approved = (await owner.getAgentRecord(id))!
        assert.equal(approved.version, '2.0.0')
        assert.equal(approved.name, proposed.name)
        assert.equal(approved.stats.stars, 1)
        assert.equal(approved.author.verified, true)
        assert.equal(await owner.getPendingEdit(id), null)
      },
    )

    await t.test(
      'leaving approved public state removes stale edits atomically',
      async () => {
        await owner.updateAgent({ ...proposed, version: '3.0.0' })
        await assertFails(
          updateDoc(liveRef, {
            visibility: 'private',
            review_status: 'pending',
          }),
        )
        await owner.setAgentVisibility(id, 'private')
        assert.equal(await owner.getPendingEdit(id), null)
        assert.equal((await owner.getAgentRecord(id))?.version, '2.0.0')
        await assertFails(
          setDoc(editRef, {
            ...proposed,
            owner_uid: 'alice',
            review_status: 'pending',
            shared_with: [],
          }),
        )
        await owner.setAgentVisibility(id, 'public')
        await admin.reviewAgent(id, 'approved')
        await owner.updateAgent({ ...proposed, version: '3.0.0' })
        await admin.reviewAgent(id, 'rejected')
        assert.equal(await owner.getPendingEdit(id), null)
      },
    )

    await t.test(
      'self-approval defaults to allowed, true allows it, false denies submissions and edits; another admin may approve',
      async () => {
        await env.withSecurityRulesDisabled(async (c) => {
          await setDoc(doc(c.firestore(), 'admins/alice'), {})
        })
        for (const setting of [undefined, true, false]) {
          await config(setting)
          const ownId = `self-${String(setting)}`
          await owner.createAgent({ ...manifest, id: ownId })
          if (setting === false) {
            await assertFails(owner.reviewAgent(ownId, 'approved'))
            await admin.reviewAgent(ownId, 'approved')
          } else await owner.reviewAgent(ownId, 'approved')
          await owner.updateAgent({ ...proposed, id: ownId })
          if (setting === false) {
            await assertFails(owner.reviewEdit(ownId, 'approved'))
            await admin.reviewEdit(ownId, 'approved')
          } else await owner.reviewEdit(ownId, 'approved')
          assert.equal((await owner.getAgentRecord(ownId))?.version, '2.0.0')
        }
        for (const firestore of [
          ownerDb,
          adminDb,
          otherDb,
          env.unauthenticatedContext().firestore(),
        ]) {
          await assertFails(
            setDoc(doc(firestore, 'config/review'), {
              allow_self_approval: true,
            }),
          )
          await assertFails(deleteDoc(doc(firestore, 'config/review')))
        }
      },
    )
  } finally {
    await env.cleanup()
  }
})
