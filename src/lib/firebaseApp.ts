import { getApp, getApps, initializeApp } from 'firebase/app'

export function getFirebaseApp() {
  const env = import.meta.env
  if (
    !env.VITE_FIREBASE_API_KEY ||
    !env.VITE_FIREBASE_PROJECT_ID ||
    !env.VITE_FIREBASE_APP_ID
  )
    throw new Error(
      'Firebase requires VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID',
    )
  return getApps().length
    ? getApp()
    : initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      })
}
