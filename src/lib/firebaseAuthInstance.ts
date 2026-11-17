import { connectAuthEmulator, getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import { getFirebaseApp } from './firebaseApp'

/**
 * Local practice mode (docs/LOCAL_TESTING.md). Vite replaces the flag at build
 * time; it is set only by `.env.emulator`, never by `.env.production`, and
 * tests/local-emulator.test.ts fails if that changes.
 */
// Optional chaining: tests run this file under tsx, where import.meta.env is absent.
export const useEmulators = import.meta.env?.VITE_FIREBASE_EMULATOR === '1'
let instance: Auth | undefined

/** The one Auth instance. Imports no Firestore code, so sign-in stays small. */
export function getAuthInstance(): Auth {
  if (instance) return instance
  instance = getAuth(getFirebaseApp())
  if (useEmulators)
    connectAuthEmulator(instance, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    })
  return instance
}
