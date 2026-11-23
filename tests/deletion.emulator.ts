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
  writeBatch,
} from 'firebase/firestore'

const kinds = [
  { item: 'agents', edit: 'agent_edits', source: 'agents' },
  { item: 'skills', edit: 'skill_edits', source: 'skills' },
  { item: 'councils', edit: 'council_edits', source: 'councils' },
] as const

test('only verified owners can atomically delete items and public exports', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const context = (uid: string, verified = true) =>
    env.authenticatedContext(uid, { email_verified: verified }).firestore()
  const owner = context('owner')
  const unverified = context('owner', false)
  const outsider = context('outsider')
  const admin = context('admin')

  async function seed(
    item: string,
    edit: string,
    id: string,
    visibility: string,
  ) {
    await env.withSecurityRulesDisabled(async (disabled) => {
      const db = disabled.firestore()
      const record = {
        owner_uid: 'owner',
        visibility,
        review_status: visibility === 'public' ? 'approved' : 'pending',
      }
      await Promise.all([
        db.doc(`${item}/${id}`).set(record),
        db.doc(`${edit}/${id}`).set(record),
      ])
    })
  }

  async function remove(
    db: ReturnType<typeof context>,
    kind: (typeof kinds)[number],
    id: string,
    includeEdit: boolean,
    includeMarker: boolean,
  ) {
    const batch = writeBatch(db)
    batch.delete(doc(db, kind.item, id))
    if (includeEdit) batch.delete(doc(db, kind.edit, id))
    if (includeMarker)
      batch.set(
        doc(db, 'export_sources', kind.source, 'changes', id),
        kind.source === 'councils'
          ? { revision: crypto.randomUUID(), changed_at: serverTimestamp() }
          : { revision: crypto.randomUUID() },
      )
    await batch.commit()
  }

  try {
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (disabled) => {
      await disabled.firestore().doc('admins/admin').set({})
    })

    for (const kind of kinds) {
      for (const visibility of ['private', 'friends'] as const) {
        const id = `${kind.item}-${visibility}`
        await seed(kind.item, kind.edit, id, visibility)
        await remove(owner, kind, id, true, false)
        assert.equal(
          (await getDocFromServer(doc(owner, kind.item, id))).exists(),
          false,
        )
      }

      const publicId = `${kind.item}-public`
      await seed(kind.item, kind.edit, publicId, 'public')
      await assertFails(remove(owner, kind, publicId, true, false))
      await assertFails(remove(owner, kind, publicId, false, true))
      await remove(owner, kind, publicId, true, true)
      assert.equal(
        (await getDocFromServer(doc(owner, kind.item, publicId))).exists(),
        false,
      )

      for (const [uid, db] of [
        ['non-owner', outsider],
        ['unverified-owner', unverified],
        ['admin-not-owner', admin],
      ] as const) {
        const id = `${kind.item}-${uid}`
        await seed(kind.item, kind.edit, id, 'private')
        await assertFails(remove(db, kind, id, false, false))
      }

      const pendingEditId = `${kind.item}-pending-edit`
      await seed(kind.item, kind.edit, pendingEditId, 'private')
      await assertFails(remove(owner, kind, pendingEditId, false, false))
    }
  } finally {
    await env.cleanup()
  }
})
