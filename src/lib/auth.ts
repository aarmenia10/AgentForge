/** Google and email/password sign-in. Firebase stays outside the browsing bundle. */
export interface AuthUser {
  uid: string
  displayName: string
  email: string
  avatarUrl: string | null
  emailVerified: boolean
}

export interface AuthService {
  signInWithGoogle(): Promise<AuthUser>
  signInWithEmail(email: string, password: string): Promise<AuthUser>
  signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthUser>
  sendPasswordReset(email: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(listener: (user: AuthUser | null) => void): () => void
}

export interface AuthRuntime extends AuthService {
  refreshUser(): Promise<AuthUser | null>
}

const sessionKey = 'agentforge.auth-session'
function rememberedSession() {
  try {
    return globalThis.localStorage?.getItem(sessionKey) === '1'
  } catch {
    return false
  }
}
function rememberSession(user: AuthUser | null) {
  try {
    if (user) globalThis.localStorage?.setItem(sessionKey, '1')
    else globalThis.localStorage?.removeItem(sessionKey)
  } catch {
    /* Storage can be disabled. The current session still works. */
  }
}

/** Dependency injection keeps service lifecycle tests independent of the SDK. */
export function createAuthService(
  load: () => Promise<AuthRuntime>,
  restore = rememberedSession(),
) {
  const listeners = new Set<(user: AuthUser | null) => void>()
  let current: AuthUser | null = null
  let pending: Promise<AuthRuntime> | undefined
  const emit = (user: AuthUser | null) => {
    current = user
    rememberSession(user)
    for (const listener of listeners) listener(user)
  }
  const runtime = () =>
    (pending ??= load()
      .then((service) => {
        service.onAuthChange(emit)
        return service
      })
      .catch((error) => {
        pending = undefined
        throw error
      }))
  const service: AuthService = {
    async signInWithGoogle() {
      const user = await (await runtime()).signInWithGoogle()
      emit(user)
      return user
    },
    async signInWithEmail(email, password) {
      const user = await (await runtime()).signInWithEmail(email, password)
      emit(user)
      return user
    },
    async signUpWithEmail(email, password, displayName) {
      const user = await (
        await runtime()
      ).signUpWithEmail(email, password, displayName)
      emit(user)
      return user
    },
    async sendPasswordReset(email) {
      await (await runtime()).sendPasswordReset(email)
    },
    async signOut() {
      if (pending || restore) await (await runtime()).signOut()
      emit(null)
    },
    onAuthChange(listener) {
      listeners.add(listener)
      listener(current)
      if (restore)
        void runtime().catch((error) =>
          console.error('Unable to restore sign-in', error),
        )
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    service,
    async refreshUser() {
      const user = await (await runtime()).refreshUser()
      emit(user)
      return user
    },
  }
}

const ready = createAuthService(
  async () => (await import('./firebaseAuth')).firebaseAuth,
)
export const authService: AuthService = ready.service
/** Call after following an email verification link to reload the user and token. */
export const refreshAuthUser = ready.refreshUser
