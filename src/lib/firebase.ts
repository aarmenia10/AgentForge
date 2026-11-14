import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFirebaseApp } from './firebaseApp'

/** Call from a dynamically imported service, never from public browsing. */
export function getFirebaseServices() {
  const app = getFirebaseApp()
  return { db: getFirestore(app), auth: getAuth(app) }
}
