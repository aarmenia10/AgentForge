import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { formatRelativeTime } from '@/lib/format'
import { hasBlockedWord } from '@/lib/blockedWords'
import { Link } from '@/router/Router'
import {
  readProfileMemory,
  rememberProfile,
} from '@/components/profile/profileMemory'
import {
  deleteComment,
  postComment,
  type ItemKind,
  type RatingComment,
} from '@/services/ratings'
import { ReportDialog } from './ReportDialog'

interface CommentsSectionProps {
  kind: ItemKind
  itemId: string
  initialComments: RatingComment[]
  authorUid?: string
}

export function CommentsSection({
  kind,
  itemId,
  initialComments,
  authorUid,
}: CommentsSectionProps) {
  const { status, user, openSignIn } = useAuth()
  const uid = status === 'signed-in' && user ? user.uid : null

  const [comments, setComments] = useState<RatingComment[]>(initialComments)
  const [body, setBody] = useState('')
  const [blockedNotice, setBlockedNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  // 'loading' until the user's profile is known. Comments are posted under the
  // profile's username only (rules check it), so no username means no form.
  const [handle, setHandle] = useState<string | null | 'loading'>('loading')
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  )

  useEffect(() => {
    setComments(initialComments)
  }, [initialComments])

  useEffect(() => {
    if (!uid) {
      setIsAdmin(false)
      return
    }
    let active = true
    import('@/services/agents')
      .then(({ isCurrentUserAdmin }) => isCurrentUserAdmin())
      .then((admin) => {
        if (active) setIsAdmin(admin)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setHandle('loading')
      return
    }
    const remembered = readProfileMemory(uid)?.handle
    if (remembered) {
      setHandle(remembered)
      return
    }
    let active = true
    Promise.all([import('@/lib/firebase'), import('firebase/firestore')])
      .then(async ([{ getFirebaseServices }, { getDoc, doc }]) => {
        const snapshot = await getDoc(
          doc(getFirebaseServices().db, 'users', uid),
        )
        const found = snapshot.exists()
          ? (snapshot.get('handle') as string)
          : null
        if (found) rememberProfile(uid, found)
        if (active) setHandle(found)
      })
      .catch(() => {
        if (active) setHandle(null)
      })
    return () => {
      active = false
    }
  }, [uid])

  const isAuthor = Boolean(authorUid && uid && authorUid === uid)

  function handleBodyChange(text: string) {
    setBody(text)
    setPostError(null)
    if (hasBlockedWord(text)) {
      setBlockedNotice(
        'Your comment contains a word that is not allowed. Please edit it before posting.',
      )
    } else {
      setBlockedNotice(null)
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!uid) {
      openSignIn({ reason: 'Sign in to leave a comment.' })
      return
    }

    const trimmed = body.trim()
    if (!trimmed) return

    if (hasBlockedWord(trimmed)) {
      setBlockedNotice(
        'Your comment contains a word that is not allowed. Please edit it before posting.',
      )
      return
    }

    setSubmitting(true)
    setPostError(null)

    try {
      const [{ getFirebaseServices }, { getDoc, doc }] = await Promise.all([
        import('@/lib/firebase'),
        import('firebase/firestore'),
      ])
      const { db } = getFirebaseServices()
      const userDoc = await getDoc(doc(db, 'users', uid))
      if (!userDoc.exists()) {
        setHandle(null)
        return
      }
      const ownHandle = userDoc.get('handle') as string

      const newComment = await postComment(db, kind, itemId, trimmed, {
        uid,
        handle: ownHandle,
      })
      setComments((prev) => [...prev, newComment])
      setBody('')
      setBlockedNotice(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not post comment.'
      setPostError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(commentId: string) {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return

    try {
      const { getFirebaseServices } = await import('@/lib/firebase')
      const { db } = getFirebaseServices()
      await deleteComment(db, kind, itemId, commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch {
      alert('Could not delete comment. Try again.')
    }
  }

  return (
    <section className="space-y-4 pt-4 border-t border-slate-900/10 dark:border-white/10">
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
        Comments ({comments.length})
      </h3>

      {comments.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No comments yet.
        </p>
      ) : (
        <ul className="space-y-3" aria-label="Comments">
          {comments.map((comment) => {
            const isOwn = Boolean(handle) && comment.author_handle === handle
            const canDelete = uid && (isOwn || isAdmin)
            const canReport = uid && !isOwn

            return (
              <li
                key={comment.id}
                className="rounded-xl border border-slate-200/80 bg-slate-900/[0.02] p-3 text-sm dark:border-white/10 dark:bg-white/[0.02]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">
                    @{comment.author_handle}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <time dateTime={comment.created_at}>
                      {formatRelativeTime(comment.created_at)}
                    </time>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        className="text-rose-600 hover:underline dark:text-rose-400"
                      >
                        Delete
                      </button>
                    )}
                    {canReport && (
                      <button
                        type="button"
                        onClick={() => setReportingCommentId(comment.id)}
                        className="hover:underline"
                      >
                        Report
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                  {comment.body}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {!uid ? (
        <p className="pt-2 text-sm text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() =>
              openSignIn({ reason: 'Sign in to leave a comment.' })
            }
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Sign in
          </button>{' '}
          to leave a comment.
        </p>
      ) : isAuthor ? (
        <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">
          Authors cannot comment on their own items.
        </p>
      ) : handle === null ? (
        <p className="pt-2 text-sm text-slate-600 dark:text-slate-400">
          Choose a username before commenting.{' '}
          <Link
            to="/settings"
            className="font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Open Settings
          </Link>
        </p>
      ) : (
        <form onSubmit={handlePost} className="space-y-2 pt-2">
          <label
            htmlFor="comment-textarea"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
          >
            Add a comment
          </label>
          <textarea
            id="comment-textarea"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value.slice(0, 1000))}
            maxLength={1000}
            rows={3}
            placeholder="Share feedback or use cases (max 1,000 characters)…"
            disabled={submitting}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {body.length} / 1,000
            </span>
            <button
              type="submit"
              disabled={submitting || !body.trim() || Boolean(blockedNotice)}
              className="rounded-xl bg-teal-500 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-600 disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Post comment'}
            </button>
          </div>
          {blockedNotice && (
            <p
              className="text-xs text-amber-600 dark:text-amber-400"
              role="alert"
            >
              {blockedNotice}
            </p>
          )}
          {postError && (
            <p
              className="text-xs text-rose-600 dark:text-rose-400"
              role="alert"
            >
              {postError}
            </p>
          )}
        </form>
      )}

      {reportingCommentId && uid && (
        <ReportDialog
          kind={kind}
          itemId={itemId}
          userId={uid}
          isOpen={true}
          onClose={() => setReportingCommentId(null)}
          onSuccess={() => {
            alert('Report submitted. Thank you.')
          }}
        />
      )}
    </section>
  )
}
