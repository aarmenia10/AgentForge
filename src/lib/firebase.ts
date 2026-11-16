import type { Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { getFirebaseApp } from './firebaseApp'
import { getAuthInstance, useEmulators } from './firebaseAuthInstance'

let services: { db: Firestore; auth: Auth } | undefined

/** Call from a dynamically imported service, never from public browsing. */
export function getFirebaseServices() {
  if (services) return services
  const db = getFirestore(getFirebaseApp())
  if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080)
  services = { db, auth: getAuthInstance() }
  return services
}
