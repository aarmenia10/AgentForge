import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { getFirebaseApp } from './firebaseApp'
import type { AuthRuntime, AuthUser } from './auth'

function userView(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName ?? '',
    email: user.email ?? '',
    avatarUrl: user.photoURL,
    emailVerified: user.emailVerified,
  }
}
const auth = () => getAuth(getFirebaseApp())
export const firebaseAuth: AuthRuntime = {
  async signInWithGoogle() {
    return userView(
      (await signInWithPopup(auth(), new GoogleAuthProvider())).user,
    )
  },
  async signInWithEmail(email, password) {
    return userView(
      (await signInWithEmailAndPassword(auth(), email, password)).user,
    )
  },
  async signUpWithEmail(email, password, displayName) {
    const { user } = await createUserWithEmailAndPassword(
      auth(),
      email,
      password,
    )
    await updateProfile(user, { displayName })
    await sendEmailVerification(user)
    return userView(user)
  },
  async sendPasswordReset(email) {
    await sendPasswordResetEmail(auth(), email)
  },
  async signOut() {
    await signOut(auth())
  },
  onAuthChange(listener) {
    return onIdTokenChanged(auth(), (user) =>
      listener(user ? userView(user) : null),
    )
  },
  async refreshUser() {
    const instance = auth()
    await instance.authStateReady()
    if (!instance.currentUser) return null
    await reload(instance.currentUser)
    await instance.currentUser.getIdToken(true)
    return userView(instance.currentUser)
  },
}
