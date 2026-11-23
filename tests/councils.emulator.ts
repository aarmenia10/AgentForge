import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { Firestore } from 'firebase-admin/firestore'
import { createCouncilStore } from '../src/services/councilStore'
import { seedRecord, exportDigest } from '../scripts/export-catalog'
import { acknowledge } from '../scripts/catalogChanges'
import { readFirestoreExport } from '../scripts/catalogFirestore'
import { SEED_AGENTS } from '../src/data/seedAgents'

test('council rules gate a 20-member roster, snapshots, proposals, and hourly takedowns', async () => {
  const projectId = 'demo-agentlemon'
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const db = new Firestore({ projectId })
  const client = (uid: string, verified = true) =>
    env.authenticatedContext(uid, { email_verified: verified }).firestore()
  const ownerDb = client('council-owner')
  const adminDb = client('council-admin')
  const anon = env.unauthenticatedContext().firestore()
  const owner = createCouncilStore(ownerDb, 'council-owner')
  const unconfirmed = createCouncilStore(
    client('council-owner', false),
    'council-owner',
  )
  const reviewer = createCouncilStore(adminDb, 'council-admin')
  const members = Array.from({ length: 20 }, (_, index) => ({
    ref: {
      kind: 'agent' as const,
      id: 'specialist-' + index,
      version: '1.0.0',
    },
    role: 'Check one part of the report',
    order: index < 12 ? 1 : 2,
  }))
  const draft = {
    council_schema_version: 1 as const,
    id: 'report-council',
    version: '1.0.0',
    visibility: 'private' as const,
    name: 'Report council',
    description: 'Assemble a report from independent checks.',
    tags: ['writing'],
    origin_app: 'chatgpt',
    instructions:
      'Check the available inputs. Compare findings and write the report.',
    members,
  }
  const path = 'councils/' + draft.id
  try {
    await env.clearFirestore()
    await Promise.all([
      db
        .doc('users/council-owner')
        .set({ handle: 'council-owner', display_name: 'Council owner' }),
      db.doc('admins/council-admin').set({}),
    ])
    const specialists = members.map(({ ref }) =>
      seedRecord({ ...SEED_AGENTS[0], id: ref.id, version: ref.version }),
    )
    const writes = db.batch()
    for (const [i, member] of specialists.entries()) {
      writes.set(
        db.doc('agents/' + member.id),
        i === 19
          ? {
              ...member,
              owner_uid: 'council-owner',
              author: { ...member.author, uid: 'council-owner' },
              review_status: 'pending',
            }
          : member,
      )
      if (i !== 19)
        writes.set(db.doc('agent_versions/' + member.id + '@1.0.0'), member)
    }
    await writes.commit()
    // Every council save needs a confirmed email, like agents and skills.
    await assert.rejects(unconfirmed.create(draft))
    await owner.create(draft)
    await assertFails(
      updateDoc(doc(client('council-outsider'), path), { name: 'Taken over' }),
    )
    const record = (await owner.get(draft.id))!
    await assertFails(
      setDoc(doc(ownerDb, path), { ...record, origin_app: 'codex' }),
    )
    await assertFails(
      setDoc(doc(ownerDb, path), {
        ...record,
        members: [...members.slice(0, 19), { ...members[19], order: 0 }],
      }),
    )
    await assertFails(getDocFromServer(doc(anon, path)))
    await assert.rejects(
      unconfirmed.setVisibility(draft.id, 'public'),
      /Confirm your email/,
    )
    await assertFails(updateDoc(doc(ownerDb, path), { visibility: 'public' }))
    await assertFails(
      setDoc(doc(ownerDb, path + '/member_checks/council-admin/groups/0'), {
        mode: 'approval',
        owner_uid: 'council-owner',
        members,
        checked_at: serverTimestamp(),
      }),
    )
    await owner.setVisibility(draft.id, 'public')
    await assertFails(getDocFromServer(doc(anon, path)))
    await assert.rejects(
      reviewer.review(draft.id, 'approved', false),
      /public and approved/,
    )
    await db.doc('agents/specialist-19').set(specialists[19])
    await db.doc('agent_versions/specialist-19@1.0.0').set(specialists[19])
    await assertFails(
      updateDoc(doc(adminDb, path), { review_status: 'approved' }),
    )
    await reviewer.review(draft.id, 'approved', false)
    assert.equal(
      (await getDocFromServer(doc(anon, path))).get('review_status'),
      'approved',
    )
    await assertFails(
      getDocFromServer(doc(adminDb, 'council_versions/report-council@1.0.0')),
    )
    await assertFails(
      updateDoc(doc(ownerDb, path), {
        visibility: 'private',
        review_status: 'pending',
      }),
    )
    assert.equal(
      (
        await owner.update({
          ...draft,
          visibility: 'public',
          version: '1.1.0',
          instructions: 'Compare independent results and summarize the report.',
        })
      ).staged,
      true,
    )
    assert.equal((await owner.get(draft.id))?.version, '1.0.0')
    await reviewer.review(draft.id, 'approved', true)
    assert.equal((await owner.get(draft.id))?.version, '1.1.0')
    const first = await readFirestoreExport(db, [], [], () => {})
    assert.equal(first.councilIndex.councils.length, 1)
    assert.equal(first.councilFiles.size, 2)
    assert.ok(first.receipts.some(({ source }) => source === 'councils'))
    assert.ok(
      first.receipts.some(({ source }) => source === 'council_versions'),
    )
    await acknowledge(db, first.receipts)
    const idle = await readFirestoreExport(db, [], [], () => {}, first)
    assert.equal(exportDigest(first), exportDigest(idle))
    await db
      .doc('agents/specialist-19')
      .update({ visibility: 'private', review_status: 'pending' })
    await db
      .doc('export_sources/agents/changes/specialist-19')
      .set({ revision: crypto.randomUUID() })
    const removed = await readFirestoreExport(db, [], [], () => {}, idle)
    assert.equal(removed.councilIndex.councils.length, 0)
    assert.equal(removed.councilFiles.size, 0)
    await acknowledge(db, removed.receipts)
    await db.doc('agents/specialist-19').set(specialists[19])
    await db
      .doc('export_sources/agents/changes/specialist-19')
      .set({ revision: crypto.randomUUID() })
    const restored = await readFirestoreExport(db, [], [], () => {}, removed)
    assert.equal(exportDigest(restored), exportDigest(first))
    await acknowledge(db, restored.receipts)

    await owner.delete(draft.id)
    const deleted = await readFirestoreExport(db, [], [], () => {}, restored)
    assert.deepEqual(deleted.councilIndex.councils, [])
    assert.equal(deleted.councilFiles.size, 0)
    assert.ok(!deleted.councilFiles.has('councils/' + draft.id + '/1.1.0.json'))
  } finally {
    await db.terminate()
    await env.cleanup()
  }
})
