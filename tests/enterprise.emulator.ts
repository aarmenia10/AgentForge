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
    for (const db of [bob, other, anonymous, unverified])
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
  } finally {
    await env.cleanup()
  }
})

test('demo workspaces require verified invited and approved members', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  try {
    await env.clearFirestore()
    const account = (uid: string, email: string, verified = true) =>
      env
        .authenticatedContext(uid, { email, email_verified: verified })
        .firestore()
    const owner = account('owner', 'owner@acme.example')
    const coworker = account('coworker', 'coworker@acme.example')
    const anonymous = env.unauthenticatedContext().firestore()
    const unverified = account('unverified', 'unverified@acme.example', false)
    const consumer = account('consumer', 'consumer@gmail.com')
    const workspace = 'enterprise_demos/owner'
    await assertSucceeds(
      setDoc(doc(owner, workspace), {
        owner: 'owner',
        email: 'owner@acme.example',
        domain: 'acme.example',
        name: 'acme.example',
      }),
    )
    await assertSucceeds(
      setDoc(doc(coworker, 'enterprise_demos/coworker'), {
        owner: 'coworker',
        email: 'coworker@acme.example',
        domain: 'acme.example',
        name: 'acme.example',
      }),
    )
    await assertSucceeds(
      setDoc(doc(owner, workspace, 'items', 'tool'), {
        name: 'Demo helper',
        description: '',
        category: 'Operations',
        kind: 'skill',
        filename: 'demo.txt',
        owner: 'owner',
        creator: 'owner@acme.example',
        createdAt: serverTimestamp(),
        file: Bytes.fromUint8Array(new Uint8Array([1])),
      }),
    )
    await assertSucceeds(getDoc(doc(owner, workspace, 'items', 'tool')))
    await assertFails(getDoc(doc(coworker, workspace, 'items', 'tool')))
    await assertSucceeds(
      setDoc(doc(owner, workspace, 'invites', 'coworker@acme.example'), {
        email: 'coworker@acme.example',
      }),
    )
    await assertSucceeds(
      setDoc(doc(coworker, workspace, 'requests', 'coworker'), {
        email: 'coworker@acme.example',
      }),
    )
    await assertFails(getDoc(doc(coworker, workspace, 'items', 'tool')))
    await assertSucceeds(
      setDoc(doc(owner, workspace, 'members', 'coworker'), {
        active: true,
        role: 'member',
        email: 'coworker@acme.example',
      }),
    )
    await assertSucceeds(getDoc(doc(coworker, workspace, 'items', 'tool')))
    await assertSucceeds(
      updateDoc(doc(owner, workspace, 'members', 'coworker'), {
        active: false,
      }),
    )
    for (const db of [coworker, anonymous, unverified, consumer])
      await assertFails(getDoc(doc(db, workspace, 'items', 'tool')))
    await assertFails(getDoc(doc(owner, 'enterprise_orgs/acme.example')))
  } finally {
    await env.cleanup()
  }
})

test('demo inquiries are only readable by platform administrators', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  try {
    await env.clearFirestore()
    const path = 'enterprise_demo_requests/inquiry'
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'admins/platform-admin'), {})
      await setDoc(doc(db, path), { company: 'Acme' })
    })
    const admin = env.authenticatedContext('platform-admin').firestore()
    const employee = env.authenticatedContext('employee').firestore()
    const anonymous = env.unauthenticatedContext().firestore()
    await assertSucceeds(getDoc(doc(admin, path)))
    for (const db of [admin, employee, anonymous]) {
      await assertFails(setDoc(doc(db, path), { company: 'Other' }))
      await assertFails(getDoc(doc(db, 'enterprise_demo_rate_limits/global')))
    }
    for (const db of [employee, anonymous])
      await assertFails(getDoc(doc(db, path)))
  } finally {
    await env.cleanup()
  }
})
