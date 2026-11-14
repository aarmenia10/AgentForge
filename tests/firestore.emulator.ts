import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { toggleStarInFirestore } from '../src/services/firestore'
import './profiles.emulator'
import './visibility.emulator'

test('real Firestore transactions and rules enforce atomic stars and per-user ownership', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentforge',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const id = SEED_AGENTS[0].id
  const path = `agents/${id}`
  try {
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), {
        ...SEED_AGENTS[0],
        owner_uid: SEED_AGENTS[0].author.uid,
        shared_with: [],
        review_status: 'approved',
      })
    })
    const alice = env.authenticatedContext('alice').firestore()
    const bob = env.authenticatedContext('bob').firestore()
    const anonymous = env.unauthenticatedContext().firestore()
    assert.equal(await toggleStarInFirestore(alice, id, 'alice'), 1)
    assert.equal(await toggleStarInFirestore(alice, id, 'alice'), 0)
    await Promise.all([
      toggleStarInFirestore(alice, id, 'alice'),
      toggleStarInFirestore(bob, id, 'bob'),
    ])
    assert.equal((await getDoc(doc(alice, path))).get('stats.stars'), 2)
    const snapshot = await readFile('public/catalog.json', 'utf8')
    try {
      await promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', 'scripts/export-catalog.ts'],
        {
          env: {
            ...process.env,
            AGENTFORGE_CATALOG_SOURCE: 'firestore',
            GOOGLE_CLOUD_PROJECT: 'demo-agentforge',
          },
        },
      )
      const exported = JSON.parse(await readFile('public/catalog.json', 'utf8'))
      assert.equal(exported.length, SEED_AGENTS.length)
      assert.equal(
        exported.find((a: { id: string }) => a.id === id).stats.stars,
        2,
      )
    } finally {
      await writeFile('public/catalog.json', snapshot)
    }
    // Two concurrent toggles of one user's record must serialize and cancel out.
    await Promise.all([
      toggleStarInFirestore(alice, id, 'alice'),
      toggleStarInFirestore(alice, id, 'alice'),
    ])
    assert.equal((await getDoc(doc(alice, path))).get('stats.stars'), 2)
    await assertSucceeds(getDoc(doc(alice, `${path}/stars/alice`)))
    await assertFails(getDoc(doc(bob, `${path}/stars/alice`)))
    await assertFails(toggleStarInFirestore(anonymous, id, 'anonymous'))
    await assertFails(toggleStarInFirestore(bob, id, 'alice'))
    await assertFails(
      updateDoc(doc(alice, path), { 'stats.stars': increment(1) }),
    )
    await assertFails(
      setDoc(doc(alice, `${path}/stars/charlie`), { user_id: 'charlie' }),
    )
    await assertFails(getDocs(collection(alice, 'agents')))
    await assertFails(updateDoc(doc(alice, path), { name: 'forged' }))
    const forged = writeBatch(alice)
    forged.delete(doc(alice, `${path}/stars/alice`))
    forged.update(doc(alice, path), {
      'stats.stars': increment(-1),
      'author.verified': false,
    })
    await assertFails(forged.commit())
    await assert.rejects(
      toggleStarInFirestore(alice, 'missing-agent', 'alice'),
      /does not exist/,
    )
    assert.equal((await getDoc(doc(alice, path))).get('stats.stars'), 2)
  } finally {
    await env.cleanup()
  }
})
