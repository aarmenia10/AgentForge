/**
 * Sign-in contract. Two methods, both free on the Firebase Spark plan:
 * Google, and email with password. No other identity provider is planned.
 *
 * Not implemented yet. See README task P2-2.
 */
export interface AuthUser {
  uid: string
  displayName: string
  email: string
  avatarUrl: string | null
}

export interface AuthService {
  signInWithGoogle(): Promise<AuthUser>
  signInWithEmail(email: string, password: string): Promise<AuthUser>
  signUpWithEmail(email: string, password: string, displayName: string): Promise<AuthUser>
  sendPasswordReset(email: string): Promise<void>
  signOut(): Promise<void>
  onAuthChange(listener: (user: AuthUser | null) => void): () => void
}
