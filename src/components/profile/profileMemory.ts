/**
 * Per-user facts remembered in this browser, so a normal visit needs no
 * Firestore read and loads no Firestore code: whether this user has a
 * profile (and its handle), and whether the welcome step has been shown.
 * Pure storage helpers. Nothing here imports Firebase.
 */
const PREFIX = 'agentlemon.profile.'

export interface ProfileMemory {
  /** The user's handle once a profile is known to exist. */
  handle: string | null
  /** The welcome step was shown (or skipped). It never shows again. */
  welcomed: boolean
}

function key(uid: string) {
  return `${PREFIX}${uid}`
}

export function readProfileMemory(uid: string): ProfileMemory | null {
  try {
    const raw = globalThis.localStorage?.getItem(key(uid))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<ProfileMemory>
    return {
      handle: typeof value.handle === 'string' ? value.handle : null,
      welcomed: value.welcomed === true,
    }
  } catch {
    return null
  }
}

function write(uid: string, value: ProfileMemory) {
  try {
    globalThis.localStorage?.setItem(key(uid), JSON.stringify(value))
  } catch {
    /* Storage can be disabled. The worst case is one extra profile read. */
  }
}

/** The user has a profile with this handle. Also counts as welcomed. */
export function rememberProfile(uid: string, handle: string) {
  write(uid, { handle, welcomed: true })
}

/** The welcome step was shown. Keeps a known handle. */
export function rememberWelcomed(uid: string) {
  write(uid, { handle: readProfileMemory(uid)?.handle ?? null, welcomed: true })
}

/** True when the welcome step may still need a profile check for this user. */
export function needsWelcomeCheck(uid: string): boolean {
  const memory = readProfileMemory(uid)
  return !memory || (!memory.welcomed && memory.handle === null)
}
