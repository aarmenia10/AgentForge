/**
 * GitHub OAuth contract. Pass 1 ships the button only.
 * TODO(codex): implement with Firebase Auth `GithubAuthProvider` (free on Spark).
 */
export interface AuthUser {
  uid: string
  githubLogin: string
  avatarUrl: string
}

export interface AuthService {
  signInWithGitHub(): Promise<AuthUser>
  signOut(): Promise<void>
  onAuthChange(listener: (user: AuthUser | null) => void): () => void
}
