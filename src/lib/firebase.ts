import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

/** Lazy: offline catalog browsing needs neither Firebase config nor a connection. */
export function getFirebaseServices() {
  const env = import.meta.env
  if (
    !env.VITE_FIREBASE_API_KEY ||
    !env.VITE_FIREBASE_PROJECT_ID ||
    !env.VITE_FIREBASE_APP_ID
  ) {
    throw new Error(
      'Firebase writes require VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID',
    )
  }
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      })
  return { db: getFirestore(app), auth: getAuth(app) }
}
