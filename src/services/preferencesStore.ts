import type { Firestore } from 'firebase/firestore'
import { doc, getDoc, setDoc } from 'firebase/firestore'

export interface UserPreferences {
  work_role?: string
  goals?: string[]
  ai_apps?: string[]
  help_topics?: string[]
}

export function createPreferencesStore(db: Firestore, uid: string) {
  const ref = () => doc(db, 'users', uid, 'private', 'preferences')
  return {
    async getPreferences(): Promise<UserPreferences | null> {
      const snap = await getDoc(ref())
      if (!snap.exists()) return null
      return snap.data() as UserPreferences
    },
    async savePreferences(prefs: UserPreferences): Promise<void> {
      await setDoc(ref(), prefs)
    },
  }
}
