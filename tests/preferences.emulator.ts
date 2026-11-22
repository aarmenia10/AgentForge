import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
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
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { createPreferencesStore } from '../src/services/preferencesStore'

test('preferences security rules enforce per-user privacy, field allowlist, and length limits', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-agentlemon',
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })

  try {
    await env.clearFirestore()
    const alice = env.authenticatedContext('alice').firestore()
    const bob = env.authenticatedContext('bob').firestore()
    const anon = env.unauthenticatedContext().firestore()

    const aliceStore = createPreferencesStore(alice, 'alice')
    const bobStore = createPreferencesStore(bob, 'bob')

    const validData = {
      work_role: 'Software',
      use_for: ['School', 'Coding projects'],
      goals: ['Find agents and skills to use', 'Share my own'],
      ai_apps: ['Claude', 'Cursor'],
      help_topics: ['Coding', 'DevOps'],
    }

    // 1. Alice can write her own preferences
    await assertSucceeds(aliceStore.savePreferences(validData))

    // 2. Alice can read her own preferences
    await assertSucceeds(aliceStore.getPreferences())

    // 3. Bob can write and read his own preferences
    await assertSucceeds(bobStore.savePreferences({ work_role: 'Student' }))
    await assertSucceeds(bobStore.getPreferences())

    // 4. Bob cannot read Alice's preferences
    await assertFails(getDoc(doc(bob, 'users/alice/private/preferences')))

    // 5. Alice cannot read Bob's preferences
    await assertFails(getDoc(doc(alice, 'users/bob/private/preferences')))

    // 6. Bob cannot write Alice's preferences
    await assertFails(
      setDoc(doc(bob, 'users/alice/private/preferences'), validData),
    )

    // 7. Unauthenticated visitor cannot read or write preferences
    await assertFails(getDoc(doc(anon, 'users/alice/private/preferences')))
    await assertFails(
      setDoc(doc(anon, 'users/alice/private/preferences'), validData),
    )

    // 8. Extra field outside allowlist is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        ...validData,
        unauthorized_field: 'attack',
      }),
    )

    // 9. work_role longer than 60 characters is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        work_role: 'x'.repeat(61),
      }),
    )

    // 10. work_role non-string is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        work_role: 12345,
      }),
    )

    // 11. goals list with more than 7 items is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        goals: ['1', '2', '3', '4', '5', '6', '7', '8'],
      }),
    )

    // 12. goals non-list is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        goals: 'not-a-list',
      }),
    )

    // 13. ai_apps list with more than 7 items is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        ai_apps: ['1', '2', '3', '4', '5', '6', '7', '8'],
      }),
    )

    // 14. help_topics list with more than 7 items is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        help_topics: ['1', '2', '3', '4', '5', '6', '7', '8'],
      }),
    )

    // 15. use_for list with more than 8 items is denied
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/preferences'), {
        use_for: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
      }),
    )

    // 16. Access to any other doc under /private is denied
    await assertFails(getDoc(doc(alice, 'users/alice/private/secrets')))
    await assertFails(
      setDoc(doc(alice, 'users/alice/private/secrets'), { secret: 'data' }),
    )

    // 17. Listing the private collection is denied
    await assertFails(getDocs(collection(alice, 'users/alice/private')))

    // 18. Valid partial update succeeds
    await assertSucceeds(
      updateDoc(doc(alice, 'users/alice/private/preferences'), {
        work_role: 'Data or finance',
      }),
    )
  } finally {
    await env.cleanup()
  }
})
