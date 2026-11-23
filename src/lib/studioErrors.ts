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
  | 'delete'
  | 'verify-author'

/** What the error is about. Agents are the default, for the existing screens. */
export type ServiceItem = 'agent' | 'skill'

const FALLBACK: Record<ServiceAction, (item: ServiceItem) => string> = {
  load: () => 'Could not load this. Reload the page to try again.',
  save: () => 'Could not save. Try again in a moment.',
  visibility: (item) => `Could not change who can see this ${item}. Try again.`,
  withdraw: () => 'Could not withdraw the edit. Try again.',
  list: () => 'Could not load this list. Reload the page to try again.',
  approve: () => 'Could not approve. Try again.',
  reject: () => 'Could not reject. Try again.',
  'take-down': (item) => `Could not take this ${item} down. Try again.`,
  delete: (item) => `Could not delete this ${item}. Try again.`,
  'verify-author': () => 'Could not change "Verified author". Try again.',
}

const DENIED: Record<ServiceAction, (item: ServiceItem) => string> = {
  load: (item) => `You do not have access to this ${item}.`,
  save: () =>
    'The server refused the save. Check that your email is confirmed and your username is set, then try again.',
  visibility: () =>
    'The server refused the change. Check that your email is confirmed, then try again.',
  withdraw: () => 'The server refused to withdraw this edit.',
  list: () => 'You do not have access to this list.',
  approve: () => 'The server refused the approval.',
  reject: () => 'The server refused the rejection.',
  'take-down': () => 'The server refused the take-down.',
  delete: (item) => `The server refused to delete this ${item}.`,
  'verify-author': () => 'The server refused the change to "Verified author".',
}

/**
 * Exact messages thrown by src/services/agentStore.ts, skillStore.ts, and
 * profileStore.ts. The skill forms mirror the agent ones (P3-9).
 */
const KNOWN: [RegExp, string][] = [
  [
    /^Skills are not available yet/,
    'Skills are not available yet. They open once the skills database is switched on.',
  ],
  [
    /^(Agent|Skill) id is taken$/,
    'That id is already taken. Choose another one.',
  ],
  [/^Create your profile first$/, 'Choose your username first.'],
  [
    /^The edit version must be higher than the live version$/,
    'The version must be higher than the version that is live now.',
  ],
  [
    /^Only the owner can edit this agent$/,
    'Only the owner can edit this agent.',
  ],
  [
    /^Only the owner can edit this skill$/,
    'Only the owner can edit this skill.',
  ],
  [/^Agent does not exist$/, 'That agent no longer exists.'],
  [/^Skill does not exist$/, 'That skill no longer exists.'],
  [
    /^Blocked skill can only be saved privately$/,
    'This skill has a blocked finding, so it can only be saved as private.',
  ],
  [
    /^(Agent|Skill) or edit does not exist$/,
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
  item: ServiceItem = 'agent',
): string {
  const code = codeOf(error)
  switch (code) {
    case 'permission-denied':
      return DENIED[action](item)
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Could not reach the server. Check your connection and try again.'
    case 'unauthenticated':
      return 'Your session ended. Sign in again to continue.'
    case 'aborted':
      return 'Something changed at the same moment. Try again.'
    case 'not-found':
      return `That ${item} no longer exists.`
    case 'resource-exhausted':
      return 'The site has reached its daily limit. Try again tomorrow.'
    case 'failed-precondition':
      return action === 'list'
        ? 'This list is not ready on the server yet. Try again later.'
        : FALLBACK[action](item)
  }
  if (error && typeof error === 'object' && 'issues' in error)
    return 'Some fields are not valid. Fix the marked fields and try again.'
  if (error instanceof Error && !code) {
    for (const [pattern, sentence] of KNOWN)
      if (pattern.test(error.message)) return sentence
  }
  return FALLBACK[action](item)
}
