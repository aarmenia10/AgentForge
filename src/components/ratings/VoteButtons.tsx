import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { formatCount } from '@/lib/format'
import { cn } from '@/components/ui'
import {
  castVote,
  readUserVote,
  type ItemKind,
  type VoteValue,
} from '@/services/ratings'

interface VoteButtonsProps {
  kind: ItemKind
  itemId: string
  initialThumbsUp: number
  initialThumbsDown?: number
  onVoteChange?: (thumbsUp: number, thumbsDown: number) => void
}

export function VoteButtons({
  kind,
  itemId,
  initialThumbsUp,
  initialThumbsDown = 0,
  onVoteChange,
}: VoteButtonsProps) {
  const { status, user, openSignIn } = useAuth()
  const uid = status === 'signed-in' && user ? user.uid : null

  const [thumbsUp, setThumbsUp] = useState(initialThumbsUp)
  const [thumbsDown, setThumbsDown] = useState(initialThumbsDown)
  const [userVote, setUserVote] = useState<VoteValue | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setThumbsUp(initialThumbsUp)
  }, [initialThumbsUp])

  useEffect(() => {
    setThumbsDown(initialThumbsDown)
  }, [initialThumbsDown])

  useEffect(() => {
    setUserVote(null)
    if (!uid) return
    let active = true

    import('@/lib/firebase')
      .then(({ getFirebaseServices }) => {
        const { db } = getFirebaseServices()
        return readUserVote(db, kind, itemId, uid)
      })
      .then((val) => {
        if (active) setUserVote(val)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [kind, itemId, uid])

  async function handleVote(targetValue: VoteValue) {
    if (!uid) {
      openSignIn({ reason: 'Sign in to vote.' })
      return
    }
    if (busy) return

    const prevUp = thumbsUp
    const prevDown = thumbsDown
    const prevVote = userVote

    const isRetraction = userVote === targetValue
    const nextVote: VoteValue | null = isRetraction ? null : targetValue

    // Optimistic calculation
    const upDelta = (nextVote === 'up' ? 1 : 0) - (prevVote === 'up' ? 1 : 0)
    const downDelta =
      (nextVote === 'down' ? 1 : 0) - (prevVote === 'down' ? 1 : 0)
    const optimisticUp = Math.max(0, prevUp + upDelta)
    const optimisticDown = Math.max(0, prevDown + downDelta)

    setThumbsUp(optimisticUp)
    setThumbsDown(optimisticDown)
    setUserVote(nextVote)
    setBusy(true)
    setMessage(null)

    try {
      const { getFirebaseServices } = await import('@/lib/firebase')
      const { db } = getFirebaseServices()
      const result = await castVote(db, kind, itemId, uid, targetValue)
      // An agent's down count is not stored on the agent (only the exporter
      // counts it), so the transaction cannot return it: keep the local one.
      const down = kind === 'agent' ? optimisticDown : result.thumbs_down
      setThumbsUp(result.thumbs_up)
      setThumbsDown(down)
      setUserVote(result.userVote)
      onVoteChange?.(result.thumbs_up, down)
    } catch (err) {
      setThumbsUp(prevUp)
      setThumbsDown(prevDown)
      setUserVote(prevVote)
      const errCode = (err as { code?: string })?.code
      if (errCode === 'permission-denied') {
        setMessage('Voting is not open for this item.')
      } else {
        setMessage('Could not save your vote. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleVote('up')}
          aria-pressed={uid ? userVote === 'up' : undefined}
          aria-busy={busy || undefined}
          aria-label={`Thumbs up, ${formatCount(thumbsUp)}`}
          title={
            uid
              ? userVote === 'up'
                ? 'Remove your thumbs up'
                : 'Thumbs up'
              : 'Sign in to vote'
          }
          disabled={busy}
          className={cn(
            '-mx-1 inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium transition',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500',
            userVote === 'up'
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          <ThumbsUp
            aria-hidden="true"
            className={cn(
              'size-4',
              userVote === 'up' &&
                'fill-current text-teal-600 dark:text-teal-400',
            )}
          />
          <span className="tabular-nums">{formatCount(thumbsUp)}</span>
        </button>

        <button
          type="button"
          onClick={() => handleVote('down')}
          aria-pressed={uid ? userVote === 'down' : undefined}
          aria-busy={busy || undefined}
          aria-label={`Thumbs down, ${formatCount(thumbsDown)}`}
          title={
            uid
              ? userVote === 'down'
                ? 'Remove your thumbs down'
                : 'Thumbs down'
              : 'Sign in to vote'
          }
          disabled={busy}
          className={cn(
            '-mx-1 inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium transition',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500',
            userVote === 'down'
              ? 'text-teal-600 dark:text-teal-400 font-semibold'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          <ThumbsDown
            aria-hidden="true"
            className={cn(
              'size-4',
              userVote === 'down' &&
                'fill-current text-teal-600 dark:text-teal-400',
            )}
          />
          <span className="tabular-nums">{formatCount(thumbsDown)}</span>
        </button>
      </div>

      {message && (
        <span
          role="status"
          className="basis-full text-xs text-rose-700 dark:text-rose-300"
        >
          {message}
        </span>
      )}
    </div>
  )
}
