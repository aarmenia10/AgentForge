/**
 * A one-bit hint that this browser had a signed-in user. It lets the app skip
 * loading Firebase entirely for visitors who have never signed in, while a
 * returning user still gets their session restored on page load.
 */
const HINT_KEY = 'agentforge:signed-in'

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function setSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(HINT_KEY, '1')
    else localStorage.removeItem(HINT_KEY)
  } catch {
    // Storage blocked: the user simply signs in again next visit.
  }
}
