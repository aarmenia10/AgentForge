import { Loader2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { isPermissionDenied } from '@/lib/studioErrors'
import { Link } from '@/router/Router'
import { RESERVED_HANDLES } from '@/services/profiles'
import { secondaryButton, textLink } from '../studio/parts'
import { readProfileMemory, rememberProfile } from './profileMemory'

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; text: string }
  | { kind: 'blocked'; text: string; settings?: boolean; friends?: boolean }

/**
 * "Add friend" on a public profile, for a signed-in visitor who is not this
 * author. Nothing is read until it is pressed, so the page itself still costs
 * no Firestore reads.
 */
export function AddFriendButton({
  handle,
  authorUid,
}: {
  handle: string
  /** From the catalog. Null when the author has no public agents. */
  authorUid: string | null
}) {
  const { status, user } = useAuth()
  const [state, setState] = useState<State>({ kind: 'idle' })

  if (status !== 'signed-in' || !user) return null
  if (RESERVED_HANDLES.some((reserved) => reserved === handle)) return null
  const mine =
    authorUid === user.uid || readProfileMemory(user.uid)?.handle === handle
  if (mine) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        This is your profile.{' '}
        <Link to="/settings" className={textLink}>
          Change your name in Settings
        </Link>
      </p>
    )
  }

  async function onAdd() {
    if (!user || state.kind === 'busy') return
    if (!user.emailVerified) {
      setState({
        kind: 'blocked',
        text: 'Confirm your email first. Friend requests unlock once it is confirmed.',
        settings: true,
      })
      return
    }
    setState({ kind: 'busy' })
    try {
      const profiles = await import('@/services/profiles')
      if (!readProfileMemory(user.uid)?.handle) {
        const own = await profiles.getProfile(user.uid)
        if (!own) {
          setState({
            kind: 'blocked',
            text: 'Choose a username first. Friends find and add each other by username.',
            settings: true,
          })
          return
        }
        rememberProfile(user.uid, own.handle)
      }
      const target = authorUid
        ? await profiles.getProfile(authorUid)
        : await profiles.getProfileByHandle(handle)
      if (!target) {
        setState({
          kind: 'blocked',
          text: `@${handle} has no account you can add as a friend.`,
        })
        return
      }
      const existing = await profiles.getRelationship(target.uid)
      if (existing?.status === 'accepted') {
        setState({ kind: 'done', text: `You and @${handle} are friends.` })
        return
      }
      if (existing && existing.sender_uid !== user.uid) {
        setState({
          kind: 'blocked',
          text: `@${handle} already sent you a request.`,
          friends: true,
        })
        return
      }
      if (!existing) await profiles.sendFriendRequest(target.uid)
      setState({
        kind: 'done',
        text: `Request sent. It becomes a friendship when @${handle} accepts it.`,
      })
    } catch (error) {
      setState({
        kind: 'blocked',
        text: isPermissionDenied(error)
          ? 'The server refused the request. Check that your email is confirmed and your username is set.'
          : 'Could not send the request. Try again.',
      })
    }
  }

  if (state.kind === 'done')
    return (
      <p role="status" className="text-sm text-teal-700 dark:text-teal-300">
        {state.text}
      </p>
    )

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onAdd}
        aria-disabled={state.kind === 'busy' || undefined}
        className={secondaryButton}
      >
        {state.kind === 'busy' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="size-4" aria-hidden="true" />
        )}
        Add friend
      </button>
      {state.kind === 'blocked' && (
        <p role="status" className="text-sm text-slate-700 dark:text-slate-200">
          {state.text}{' '}
          {state.settings && (
            <Link to="/settings" className={textLink}>
              Open Settings
            </Link>
          )}
          {state.friends && (
            <Link to="/friends" className={textLink}>
              Answer it on the Friends page
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
