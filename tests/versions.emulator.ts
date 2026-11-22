import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocFromServer,
  writeBatch,
} from 'firebase/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { createAgentStore } from '../src/services/agentStore'
import { createProfileStore } from '../src/services/profileStore'
import { agentResolver, loadCatalog } from '../packages/mcp-server/src/catalog'
import { createEmulatorCatalogExport } from './emulatorCatalogExport'

test('approved versions are atomic, exact, immutable and cannot be reused', async (t) => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const ownerDb = env
    .authenticatedContext('alice', { email_verified: true })
    .firestore()
  const adminDb = env
    .authenticatedContext('admin', { email_verified: true })
    .firestore()
  const owner = createAgentStore(ownerDb, 'alice')
  const admin = createAgentStore(adminDb, 'admin')
  const id = 'history-agent'
  const manifest = { ...SEED_AGENTS[0], id, version: '1.0.0' }
  try {
    const { directory, run: exportLive } = await createEmulatorCatalogExport(t)
    const catalogPath = join(directory, 'catalog.json')
    const versionsPath = join(directory, 'agents', id)
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (c) =>
      setDoc(doc(c.firestore(), 'admins/admin'), {}),
    )
    await createProfileStore(ownerDb, 'alice').createProfile({
      handle: 'alice-user',
      display_name: 'Alice',
      avatar_url: null,
    })
    await owner.createAgent(manifest)
    const pending = (await owner.getAgentRecord(id))!
    const approved = { ...pending, review_status: 'approved' }
    const path = `agent_versions/${id}@1.0.0`
    await assertFails(
      updateDoc(doc(adminDb, 'agents', id), { review_status: 'approved' }),
    )
    assert.equal((await owner.getAgentRecord(id))?.review_status, 'pending')
    for (const db of [ownerDb, env.unauthenticatedContext().firestore()]) {
      const batch = writeBatch(db)
      batch.update(doc(db, 'agents', id), { review_status: 'approved' })
      batch.set(doc(db, path), approved)
      await assertFails(batch.commit())
    }
    for (const patch of [
      { name: 'Forged snapshot' },
      { version: '2.0.0' },
      { owner_uid: 'other' },
    ]) {
      const batch = writeBatch(adminDb)
      batch.update(doc(adminDb, 'agents', id), { review_status: 'approved' })
      batch.set(doc(adminDb, path), { ...approved, ...patch })
      await assertFails(batch.commit())
    }
    await admin.reviewAgent(id, 'approved')
    await env.withSecurityRulesDisabled(async (c) =>
      assert.deepEqual(
        (await getDocFromServer(doc(c.firestore(), path))).data(),
        approved,
      ),
    )
    for (const db of [
      ownerDb,
      adminDb,
      env.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDocFromServer(doc(db, path)))
      await assertFails(updateDoc(doc(db, path), { name: 'Changed' }))
      await assertFails(setDoc(doc(db, path), approved))
      await assertFails(deleteDoc(doc(db, path)))
    }
    await admin.reviewAgent(id, 'rejected')
    await admin.reviewAgent(id, 'approved') // Identical content reuses the snapshot without writing it.
    await owner.updateAgent({
      ...manifest,
      version: '1.1.0',
      name: 'New approved content',
    })
    await admin.reviewEdit(id, 'approved')
    await env.withSecurityRulesDisabled(async (c) => {
      assert.deepEqual(
        (await getDocFromServer(doc(c.firestore(), path))).data(),
        approved,
      )
      assert.equal(
        (
          await getDocFromServer(
            doc(c.firestore(), `agent_versions/${id}@1.1.0`),
          )
        ).get('name'),
        'New approved content',
      )
    })
    await exportLive()
    const catalog = await loadCatalog(catalogPath)
    assert.equal(catalog.find((agent) => agent.id === id)?.version, '1.1.0')
    const historical = await agentResolver(catalog, catalogPath)(`${id}@1.0.0`)
    assert.equal(historical.name, manifest.name)
    assert.deepEqual(historical.prompt_blueprint, manifest.prompt_blueprint)
    await access(join(versionsPath, '1.1.0.json'))
    // Private drafts may reuse a version; approving changed content at that
    // version must still fail, even after another version was published.
    await owner.setAgentVisibility(id, 'private')
    await exportLive()
    await assert.rejects(access(join(versionsPath, '1.0.0.json')))
    await assert.rejects(access(join(versionsPath, '1.1.0.json')))
    await owner.updateAgent({
      ...manifest,
      visibility: 'private',
      name: 'Reused version',
    })
    await owner.setAgentVisibility(id, 'public')
    await assertFails(admin.reviewAgent(id, 'approved'))
    assert.equal((await owner.getAgentRecord(id))?.review_status, 'pending')
  } finally {
    await env.cleanup()
  }
})
