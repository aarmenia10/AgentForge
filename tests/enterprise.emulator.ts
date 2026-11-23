import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  Bytes,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'

test('enterprise rules enforce membership, verified email, and tenant boundaries', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  try {
    await env.clearFirestore()
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'enterprise_orgs/acme.example'), { name: 'Acme' })
      await setDoc(doc(db, 'enterprise_orgs/acme.example/members/alice'), {
        role: 'admin',
        active: true,
        email: 'alice@acme.example',
      })
    })
    const alice = env
      .authenticatedContext('alice', {
        email: 'alice@acme.example',
        email_verified: true,
      })
      .firestore()
    const bob = env
      .authenticatedContext('bob', {
        email: 'bob@acme.example',
        email_verified: true,
      })
      .firestore()
    const other = env
      .authenticatedContext('other', {
        email: 'other@other.example',
        email_verified: true,
      })
      .firestore()
    const unverified = env
      .authenticatedContext('alice', {
        email: 'alice@acme.example',
        email_verified: false,
      })
      .firestore()
    const personal = env
      .authenticatedContext('personal', {
        email: 'person@gmail.com',
        email_verified: true,
      })
      .firestore()
    const anonymous = env.unauthenticatedContext().firestore()
    const path = 'enterprise_orgs/acme.example/items/tool'
    await assertSucceeds(
      setDoc(doc(alice, path), {
        name: 'Internal helper',
        description: '',
        category: 'Operations',
        kind: 'agent',
        filename: 'tool.txt',
        owner: 'alice',
        creator: 'alice@acme.example',
        createdAt: serverTimestamp(),
        file: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
    await assertSucceeds(getDoc(doc(alice, path)))
    for (const db of [bob, other, anonymous, unverified, personal])
      await assertFails(getDoc(doc(db, path)))
    await assertSucceeds(
      setDoc(doc(bob, 'enterprise_orgs/acme.example/requests/bob'), {
        email: 'bob@acme.example',
      }),
    )
    await assertSucceeds(
      setDoc(doc(alice, 'enterprise_orgs/acme.example/members/bob'), {
        active: true,
        role: 'member',
        email: 'bob@acme.example',
      }),
    )
    await assertSucceeds(getDoc(doc(bob, path)))
    await assertSucceeds(
      updateDoc(doc(alice, 'enterprise_orgs/acme.example/members/bob'), {
        active: false,
      }),
    )
    await assertFails(getDoc(doc(bob, path)))
    const demoPath = 'enterprise_demos/personal/items/tool'
    await assertSucceeds(
      setDoc(doc(personal, demoPath), {
        name: 'Demo helper',
        description: '',
        category: 'Operations',
        kind: 'skill',
        filename: 'demo.txt',
        owner: 'personal',
        creator: 'person@gmail.com',
        createdAt: serverTimestamp(),
        file: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
    await assertSucceeds(getDoc(doc(personal, demoPath)))
    for (const db of [alice, bob, other, anonymous, unverified])
      await assertFails(getDoc(doc(db, demoPath)))
    await assertFails(
      setDoc(doc(personal, 'enterprise_registrations/personal'), {
        domain: 'gmail.com',
        name: 'Fake organization',
        challenge: '12345678-1234-1234-1234-123456789012',
      }),
    )
    await assertFails(
      setDoc(doc(alice, 'enterprise_registrations/alice'), {
        domain: 'acme.example',
        name: 'Acme',
        challenge: '12345678-1234-1234-1234-123456789012',
      }),
    )
  } finally {
    await env.cleanup()
  }
})
