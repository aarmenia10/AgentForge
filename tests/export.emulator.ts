import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertFails,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore'
import { Firestore, setLogFunction } from 'firebase-admin/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createAgentStore } from '../src/services/agentStore'
import { markExportChange } from '../src/services/firestore'
import { toggleUp } from './voteHelper'
import { createProfileStore } from '../src/services/profileStore'
import {
  exportDigest,
  seedRecord,
  writeVersionFiles,
} from '../scripts/export-catalog'
import type { PublicExport } from '../scripts/export-catalog'
import { acknowledge } from '../scripts/catalogChanges'
import { readFirestoreExport } from '../scripts/catalogFirestore'

// Count actual BatchGetDocuments / RunQuery responses at the Admin SDK's RPC
// boundary. Include point misses and track empty queries separately.
async function measure<T>(run: () => Promise<T>) {
  const paths: string[] = []
  const queries: string[] = []
  setLogFunction((message) => {
    const match = message.match(
      /\[Firestore\.requestStream\]: (Sending request|Received response): (.*)$/,
    )
    if (!match) return
    const rpc = JSON.parse(match[2])
    if (rpc.structuredQuery)
      queries.push(
        rpc.parent.split('/documents/').pop() +
          '/' +
          rpc.structuredQuery.from[0].collectionId,
      )
    const name = rpc.document?.name ?? rpc.found?.name ?? rpc.missing
    if (typeof name === 'string') paths.push(name.split('/documents/')[1])
  })
  try {
    return { result: await run(), paths, queries }
  } finally {
    setLogFunction(null)
  }
}

test('hourly export reads only dirty documents and acknowledges only published revisions', async () => {
  const projectId = 'demo-agentlemon'
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const db = new Firestore({ projectId })
  const directory = await mkdtemp(join(tmpdir(), 'hourly-export-'))
  // A modular reference retains the test context's emulator and mock auth.
  const client = (uid: string) =>
    doc(
      env.authenticatedContext(uid, { email_verified: true }).firestore(),
      'admins/admin',
    ).firestore
  const ownerDb = client('alice')
  const adminDb = client('admin')
  const owner = createAgentStore(ownerDb, 'alice')
  const admin = createAgentStore(adminDb, 'admin')
  const seeds = [SEED_AGENTS[0]]
  const seed = seeds[0]
  const id = 'hourly-agent'
  const manifest = { ...seed, id, version: '1.0.0' }
  const marker = (source: string, key: string) =>
    `export_sources/${source}/changes/${key}`
  const ref = doc(adminDb, 'agents', id)
  const queue = doc(ownerDb, marker('agents', id))
  const pin = `${id}/1.0.0.json`
  let previous: PublicExport | undefined
  const build = () => readFirestoreExport(db, seeds, [], () => {}, previous)
  const publish = async (paths: string[]) => {
    const observed = await measure(build)
    assert.deepEqual(observed.paths.sort(), paths.sort())
    if (!paths.length)
      assert.deepEqual(observed.queries.sort(), [
        'export_sources/agent_versions/changes',
        'export_sources/agents/changes',
        'export_sources/comments/changes',
        'export_sources/council_versions/changes',
        'export_sources/councils/changes',
        'export_sources/skill_versions/changes',
        'export_sources/skills/changes',
        'export_sources/votes/changes',
      ])
    await writeVersionFiles(directory, observed.result.files)
    previous = observed.result
    await acknowledge(db, observed.result.receipts)
    return observed.result
  }
  try {
    await env.clearFirestore()
    await db.doc('admins/admin').set({})
    // A legacy public item and snapshot have no markers.
    const legacy = seedRecord({ ...seed, id: 'legacy' })
    await db.doc('agents/legacy').set(legacy)
    const old = { ...legacy, version: '0.0.1' }
    await db.doc('agent_versions/legacy@0.0.1').set(old)
    previous = await build()
    assert.ok(previous.files.has('legacy/0.0.1.json'))
    const original = previous
    await publish([])
    // An admin may backfill an exact current snapshot on its own.
    const key = 'legacy@' + legacy.version
    const versionRef = doc(adminDb, 'agent_versions', key)
    await assertFails(setDoc(versionRef, legacy))
    const backfill = writeBatch(adminDb)
    backfill.set(versionRef, legacy)
    markExportChange(backfill, adminDb, 'agent_versions', key)
    await backfill.commit()
    const backfilled = await publish([
      marker('agent_versions', key),
      'agent_versions/' + key,
    ])
    assert.deepEqual(backfilled.catalog, original.catalog)
    assert.notEqual(exportDigest(backfilled), exportDigest(original))
    await createProfileStore(ownerDb, 'alice').createProfile({
      handle: 'alice-user',
      display_name: 'Alice',
      avatar_url: null,
    })
    await owner.createAgent(manifest)
    await publish([])
    await admin.reviewAgent(id, 'approved')
    const live = 'agents/' + id
    const agentMarker = marker('agents', id)
    const snap = (v: string) => `agent_versions/${id}@${v}`
    const snapMarker = (v: string) => marker('agent_versions', id + '@' + v)
    let result = await publish([
      agentMarker,
      live,
      snapMarker('1.0.0'),
      snap('1.0.0'),
    ])
    assert.ok(result.files.has(pin))
    await publish([])
    await assertFails(getDocFromServer(queue))
    await assertFails(setDoc(queue, { revision: crypto.randomUUID() }))
    await assertFails(updateDoc(ref, { 'author.verified': true }))
    const forged = writeBatch(ownerDb)
    forged.update(doc(ownerDb, 'agents', id), { 'author.verified': true })
    markExportChange(forged, ownerDb, 'agents', id)
    await assertFails(forged.commit())
    await toggleUp(ownerDb, id, 'alice')
    const stale = await build()
    assert.equal(stale.catalog.find((a) => a.id === id)?.stats.stars, 1)
    // A second commit races acknowledgement of the first; even an old marker
    // already present cannot authorize an unmarked source change.
    await assertFails(updateDoc(ref, { review_status: 'rejected' }))
    await assertFails(deleteDoc(queue))
    await admin.setAuthorVerified(id, true)
    await acknowledge(db, stale.receipts)
    result = await publish([agentMarker, live])
    assert.equal(result.catalog.find((a) => a.id === id)?.author.verified, true)
    assert.equal(result.catalog.find((a) => a.id === id)?.stats.stars, 1)
    await owner.updateAgent({ ...manifest, version: '2.0.0' })
    await publish([])
    await admin.reviewEdit(id, 'approved')
    result = await publish([
      agentMarker,
      live,
      snapMarker('2.0.0'),
      snap('2.0.0'),
    ])
    assert.ok(result.files.has(pin))
    assert.ok(result.files.has(id + '/2.0.0.json'))
    assert.equal(
      exportDigest(result),
      exportDigest(await readFirestoreExport(db, seeds, [], () => {})),
    )
    for (const visibility of ['friends', 'private'] as const) {
      await owner.setAgentVisibility(id, visibility)
      result = await publish([agentMarker, live])
      assert.ok(!result.catalog.some((a) => a.id === id))
      await assert.rejects(access(join(directory, pin)))
      await assert.rejects(access(join(directory, id, '2.0.0.json')))
      await owner.setAgentVisibility(id, 'public')
      await admin.reviewAgent(id, 'approved')
      result = await publish([agentMarker, live, snap('1.0.0'), snap('2.0.0')])
      assert.ok(result.files.has(pin))
    }
    await admin.reviewAgent(id, 'rejected')
    result = await publish([agentMarker, live])
    assert.ok(!result.catalog.some((a) => a.id === id))
    await assert.rejects(access(join(directory, pin)))
    await toggleUp(ownerDb, seed.id, 'alice')
    // A vote marks the item under `votes`, and the export still refreshes it.
    result = await publish([
      marker('votes', 'agents_' + seed.id),
      'agents/' + seed.id,
    ])
    assert.equal(result.catalog.find((a) => a.id === seed.id)?.stats.stars, 1)
    await admin.reviewAgent(seed.id, 'rejected')
    result = await publish([marker('agents', seed.id), 'agents/' + seed.id])
    assert.ok(!result.catalog.some((a) => a.id === seed.id))
    await assert.rejects(
      access(join(directory, seed.id, seed.version + '.json')),
    )
    await publish([])

    const deletable = { ...manifest, id: 'delete-agent', version: '1.0.0' }
    await owner.createAgent(deletable)
    await owner.setAgentVisibility(deletable.id, 'public')
    await admin.reviewAgent(deletable.id, 'approved')
    result = await publish([
      marker('agents', deletable.id),
      'agents/' + deletable.id,
      marker('agent_versions', deletable.id + '@1.0.0'),
      'agent_versions/' + deletable.id + '@1.0.0',
    ])
    assert.ok(result.catalog.some((a) => a.id === deletable.id))
    assert.ok(result.files.has(deletable.id + '/1.0.0.json'))
    await owner.deleteAgent(deletable.id)
    result = await publish([
      marker('agents', deletable.id),
      'agents/' + deletable.id,
    ])
    assert.ok(!result.catalog.some((a) => a.id === deletable.id))
    assert.ok(!result.files.has(deletable.id + '/1.0.0.json'))
  } finally {
    await db.terminate()
    await env.cleanup()
    await rm(directory, { recursive: true, force: true })
  }
})
