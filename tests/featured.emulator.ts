import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { Firestore } from 'firebase-admin/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { currentFeaturedWeek } from '../src/lib/featured'
import { markExportChange } from '../src/services/firestore'
import { acknowledge } from '../scripts/catalogChanges'
import { readFirestoreExport } from '../scripts/catalogFirestore'
import { buildFeatured } from '../scripts/featuredExport'
import { seedRecord } from '../scripts/export-catalog'
import { createEmulatorCatalogExport } from './emulatorCatalogExport'

const selectionPath = 'featured/current'
const markerPath = 'export_sources/featured/changes/current'
const pick = { kind: 'agent', id: SEED_AGENTS[0].id, note: 'Try this first.' }
const revision = () => ({ revision: crypto.randomUUID() })

test('featured rules restrict reads and atomic writes to admins and validate all picks', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  try {
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'admins/curator'), { role: 'admin' })
    })
    const admin = doc(
      env.authenticatedContext('curator').firestore(),
      selectionPath,
    )
    const member = doc(
      env.authenticatedContext('member').firestore(),
      selectionPath,
    )
    const anonymous = doc(
      env.unauthenticatedContext().firestore(),
      selectionPath,
    )

    function payload(
      uid: string,
      items: unknown[],
      patch: Record<string, unknown> = {},
    ) {
      return {
        week_of: currentFeaturedWeek(),
        items,
        updated_by: uid,
        updated_at: serverTimestamp(),
        ...patch,
      }
    }

    function save(ref: typeof admin, data: ReturnType<typeof payload>) {
      const batch = writeBatch(ref.firestore)
      batch.set(ref, data)
      markExportChange(batch, ref.firestore, 'featured', 'current')
      return batch.commit()
    }

    await assertFails(setDoc(admin, payload('curator', [pick])))
    await assertFails(setDoc(doc(admin.firestore, markerPath), revision()))
    await assertSucceeds(
      save(
        admin,
        payload('curator', [
          pick,
          { kind: 'skill', id: 'a-skill' },
          { kind: 'council', id: 'a-council', note: 'x'.repeat(140) },
        ]),
      ),
    )
    assert.equal(
      (await assertSucceeds(getDocFromServer(admin))).get('items').length,
      3,
    )
    for (const [ref, uid] of [
      [member, 'member'],
      [anonymous, 'anonymous'],
    ] as const) {
      await assertFails(getDocFromServer(ref))
      await assertFails(save(ref, payload(uid, [pick])))
      await assertFails(setDoc(doc(ref.firestore, markerPath), revision()))
    }
    await assertFails(getDocFromServer(doc(admin.firestore, markerPath)))
    await assertFails(
      setDoc(
        doc(admin.firestore, 'export_sources/featured/changes/other'),
        revision(),
      ),
    )
    for (const items of [
      [pick, pick, pick, pick],
      [{ ...pick, kind: 'template' }],
      [pick, { ...pick, note: 'x'.repeat(141) }],
      [pick, pick, { ...pick, extra: true }],
      [{ ...pick, id: 'invalid/path' }],
      [{ ...pick, note: 10 }],
    ])
      await assertFails(save(admin, payload('curator', items)))
    await assertFails(
      save(admin, payload('curator', [pick], { week_of: '2000-01-03' })),
    )
    await assertFails(save(admin, payload('somebody-else', [pick])))
    await assertFails(
      save(admin, payload('curator', [pick], { updated_at: new Date(0) })),
    )
    await assertSucceeds(save(admin, payload('curator', [])))
    assert.deepEqual((await getDocFromServer(admin)).get('items'), [])
  } finally {
    await env.cleanup()
  }
})

test('featured export writes an empty feed for missing or empty picks and fingerprints surviving public picks', async (t) => {
  const projectId = 'demo-agentlemon'
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const db = new Firestore({ projectId })
  try {
    await env.clearFirestore()
    const { directory, run } = await createEmulatorCatalogExport(t)
    const read = async (file: string) =>
      JSON.parse(await readFile(join(directory, file), 'utf8'))
    const week_of = currentFeaturedWeek()
    const empty = { week_of: null, items: [] }
    const ref = db.doc(selectionPath)
    const marker = db.doc(markerPath)
    const records = SEED_AGENTS.map((seed) => seedRecord(seed))
    await db
      .doc('agents/private-test')
      .set({ ...records[0], id: 'private-test', visibility: 'private' })
    await db
      .doc('agents/pending-test')
      .set({ ...records[0], id: 'pending-test', review_status: 'pending' })
    await run()
    assert.deepEqual(await read('featured.json'), empty)
    const initial = await read('export-state.json')

    await ref.set({ week_of, items: [] })
    await run()
    assert.deepEqual(await read('featured.json'), empty)
    assert.deepEqual(await read('export-state.json'), initial)

    await ref.set({
      week_of,
      items: [
        { ...pick, id: 'private-test' },
        { ...pick, id: SEED_AGENTS[1].id, note: 'Second seed, first pick.' },
        { ...pick, id: 'pending-test' },
      ],
    })
    await run()
    const expected = {
      week_of,
      items: [
        {
          kind: 'agent',
          id: SEED_AGENTS[1].id,
          version: SEED_AGENTS[1].version,
          name: SEED_AGENTS[1].name,
          description: SEED_AGENTS[1].description,
          note: 'Second seed, first pick.',
          author_handle: SEED_AGENTS[1].author.handle,
        },
      ],
    }
    assert.deepEqual(await read('featured.json'), expected)
    assert.notDeepEqual(await read('export-state.json'), initial)
    const published = await read('export-state.json')
    await ref.set({
      week_of,
      items: [
        { ...pick, id: SEED_AGENTS[1].id, note: 'Second seed, first pick.' },
        pick,
      ],
    })
    await run()
    assert.deepEqual(
      (await read('featured.json')).items.map(({ id }: { id: string }) => id),
      [SEED_AGENTS[1].id, pick.id],
    )
    assert.notDeepEqual(await read('export-state.json'), published)

    const full = await readFirestoreExport(db, SEED_AGENTS, [], () => {})
    await ref.set({ week_of, items: [pick] })
    const clean = await readFirestoreExport(db, SEED_AGENTS, [], () => {}, full)
    assert.deepEqual(
      buildFeatured(clean.featuredSelection, clean),
      buildFeatured(full.featuredSelection, full),
    )
    await marker.set(revision())
    const changed = await readFirestoreExport(
      db,
      SEED_AGENTS,
      [],
      () => {},
      clean,
    )
    assert.deepEqual(
      buildFeatured(changed.featuredSelection, changed).items.map(
        ({ id }) => id,
      ),
      [pick.id],
    )
    await acknowledge(db, changed.receipts)
    assert.equal((await marker.get()).exists, false)

    // A later catalog takedown removes a pick on the same export, even without a new admin save.
    await db.doc(`agents/${pick.id}`).update({ review_status: 'rejected' })
    await db.doc(`export_sources/agents/changes/${pick.id}`).set(revision())
    const withdrawn = await readFirestoreExport(
      db,
      SEED_AGENTS,
      [],
      () => {},
      changed,
    )
    assert.deepEqual(
      buildFeatured(withdrawn.featuredSelection, withdrawn),
      empty,
    )
  } finally {
    await db.terminate()
    await env.cleanup()
  }
})
