/**
 * Turns errors from src/services into sentences a person can act on. Raw SDK
 * text never reaches the page: an error this file does not recognise becomes
 * the action's generic fallback.
 */

export type ServiceAction =
  | 'load'
  | 'save'
  | 'visibility'
  | 'withdraw'
  | 'list'
  | 'approve'
  | 'reject'
  | 'take-down'
  | 'verify-author'

const FALLBACK: Record<ServiceAction, string> = {
  load: 'Could not load this. Reload the page to try again.',
  save: 'Could not save. Try again in a moment.',
  visibility: 'Could not change who can see this agent. Try again.',
  withdraw: 'Could not withdraw the edit. Try again.',
  list: 'Could not load this list. Reload the page to try again.',
  approve: 'Could not approve. Try again.',
  reject: 'Could not reject. Try again.',
  'take-down': 'Could not take this agent down. Try again.',
  'verify-author': 'Could not change "Verified author". Try again.',
}

const DENIED: Record<ServiceAction, string> = {
  load: 'You do not have access to this agent.',
  save: 'The server refused the save. Check that your email is confirmed and your username is set, then try again.',
  visibility:
    'The server refused the change. Check that your email is confirmed, then try again.',
  withdraw: 'The server refused to withdraw this edit.',
  list: 'You do not have access to this list.',
  approve: 'The server refused the approval.',
  reject: 'The server refused the rejection.',
  'take-down': 'The server refused the take-down.',
  'verify-author': 'The server refused the change to "Verified author".',
}

/** Exact messages thrown by src/services/agentStore.ts and profileStore.ts. */
const KNOWN: [RegExp, string][] = [
  [/^Agent id is taken$/, 'That id is already taken. Choose another one.'],
  [/^Create your profile first$/, 'Choose your username first.'],
  [
    /^The edit version must be higher than the live version$/,
    'The version must be higher than the version that is live now.',
  ],
  [
    /^Only the owner can edit this agent$/,
    'Only the owner can edit this agent.',
  ],
  [/^Agent does not exist$/, 'That agent no longer exists.'],
  [
    /^Agent or edit does not exist$/,
    'That edit is no longer waiting. Someone may have handled it already.',
  ],
  [/^Sign in/, 'Your session ended. Sign in again to continue.'],
  [/^Page size must be/, 'Could not load this list.'],
]

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code.replace(/^firestore\//, '')
  }
  return null
}

export function isPermissionDenied(error: unknown): boolean {
  return codeOf(error) === 'permission-denied'
}

export function describeServiceError(
  error: unknown,
  action: ServiceAction,
): string {
  const code = codeOf(error)
  switch (code) {
    case 'permission-denied':
      return DENIED[action]
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Could not reach the server. Check your connection and try again.'
    case 'unauthenticated':
      return 'Your session ended. Sign in again to continue.'
    case 'aborted':
      return 'Something changed at the same moment. Try again.'
    case 'not-found':
      return 'That agent no longer exists.'
    case 'resource-exhausted':
      return 'The site has reached its daily limit. Try again tomorrow.'
    case 'failed-precondition':
      return action === 'list'
        ? 'This list is not ready on the server yet. Try again later.'
        : FALLBACK[action]
  }
  if (error && typeof error === 'object' && 'issues' in error)
    return 'Some fields are not valid. Fix the marked fields and try again.'
  if (error instanceof Error && !code) {
    for (const [pattern, sentence] of KNOWN)
      if (pattern.test(error.message)) return sentence
  }
  return FALLBACK[action]
}
