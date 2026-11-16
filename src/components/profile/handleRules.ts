import { RESERVED_HANDLES, validHandle } from '@/services/profiles'
import { describeServiceError } from '@/lib/studioErrors'

/** The username format, said the way a person reads it. */
export const HANDLE_RULE =
  'Use 3 to 30 lowercase letters, digits, or hyphens, starting and ending with a letter or digit.'

/** Shown beside the username field. Owner-approved: published agents are not renamed. */
export const PUBLISHED_HANDLE_NOTE =
  'Agents you have already published keep the username they were approved under until you publish an update.'

/** Why this username cannot be used, or null when its format is fine. */
export function handleFormatProblem(handle: string): string | null {
  if (!handle) return 'Choose a username.'
  if (/[A-Z]/.test(handle)) return 'Use lowercase letters only.'
  if (handle.length < 3) return 'Use at least 3 characters.'
  if (handle.length > 30) return 'Use at most 30 characters.'
  if (/[^a-z0-9-]/.test(handle))
    return 'Use only lowercase letters, digits, and hyphens.'
  if (handle.startsWith('-') || handle.endsWith('-'))
    return 'Start and end with a letter or digit.'
  if (RESERVED_HANDLES.some((reserved) => reserved === handle))
    return 'That username is reserved.'
  if (!validHandle(handle)) return HANDLE_RULE
  return null
}

/** Display names: 1 to 100 characters, not only spaces. */
export function displayNameProblem(name: string): string | null {
  if (!name.trim()) return 'Enter the name people see.'
  if (name.length > 100) return 'Use at most 100 characters.'
  return null
}

/** Errors from createProfile and updateProfile, in plain words. */
export function describeProfileError(error: unknown): string {
  if (error instanceof Error && !('code' in error)) {
    if (/^Handle is taken$/.test(error.message))
      return 'Someone just took that username. Choose another one.'
    if (/^Profile already exists$/.test(error.message))
      return 'You already have a profile. Reload the page to change it.'
    if (/^Invalid or reserved handle$/.test(error.message))
      return 'That username cannot be used. ' + HANDLE_RULE
    if (/^Display name/.test(error.message))
      return 'Enter a display name of 1 to 100 characters.'
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    String((error as { code: unknown }).code).endsWith('permission-denied')
  )
    return 'The server refused the change. Reload the page and try again.'
  return describeServiceError(error, 'save')
}
