import type { UserPreferences } from './preferencesStore'

export type { UserPreferences }

async function store() {
  const [{ getFirebaseServices }, { createPreferencesStore }] =
    await Promise.all([import('../lib/firebase'), import('./preferencesStore')])
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to manage preferences')
  return createPreferencesStore(db, auth.currentUser.uid)
}

export async function getPreferences(): Promise<UserPreferences | null> {
  return (await store()).getPreferences()
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  return (await store()).savePreferences(prefs)
}
