import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserPopupRedirectResolver,
  connectAuthEmulator,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirebaseApp } from '@/lib/firebaseApp'
import { useEmulators } from '@/lib/firebaseAuthInstance'
import { CONNECTOR_ORIGIN } from './connectorConfig'

export interface ConsentDetails {
  host: string
  name: string
  loopback: boolean
  scopes: string[]
}

export function freshConnectorSession() {
  let app: FirebaseApp | undefined
  let auth: ReturnType<typeof initializeAuth> | undefined
  function instance() {
    if (auth) return auth
    app = initializeApp(
      getFirebaseApp().options,
      `connector-${crypto.randomUUID()}`,
    )
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
    if (useEmulators)
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
        disableWarnings: true,
      })
    return auth
  }
  return {
    async prepare() {
      await instance().authStateReady()
    },
    async signInWithEmail(email: string, password: string): Promise<User> {
      return (await signInWithEmailAndPassword(instance(), email, password))
        .user
    },
    async signInWithGoogle(): Promise<User> {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      return (await signInWithPopup(instance(), provider)).user
    },
    refreshToken: () => auth?.currentUser?.refreshToken ?? null,
    async close() {
      const current = auth
      const currentApp = app
      auth = app = undefined
      if (current) await signOut(current).catch(() => {})
      if (currentApp) await deleteApp(currentApp).catch(() => {})
    },
  }
}

export async function connectorConsent<T>(
  step: 'describe' | 'complete' | 'deny',
  request: object,
): Promise<T> {
  const response = await fetch(`${CONNECTOR_ORIGIN}/connect/${step}`, {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : 'Could not connect to AgentLemon.',
    )
  return result as T
}

export function finishConnectorConsent(finish: string) {
  if (
    typeof finish !== 'string' ||
    !finish.startsWith(`${CONNECTOR_ORIGIN}/authorize/finish?`)
  )
    throw new Error('Invalid connection response. Start again in your AI app.')
  window.location.replace(finish)
}
