import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { submitReport, type ItemKind } from '@/services/ratings'

export interface ReportDialogProps {
  kind: ItemKind
  itemId: string
  userId?: string
  targetType?: 'item' | 'comment'
  targetId?: string
  isOpen?: boolean
  onClose: () => void
  onSuccess?: () => void
}

const REASONS: readonly {
  id: 'spam' | 'harmful' | 'misleading' | 'other'
  label: string
}[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'harmful', label: 'Harmful content' },
  { id: 'misleading', label: 'Misleading description' },
  { id: 'other', label: 'Other' },
]

export function ReportDialog({
  kind,
  itemId,
  userId: propUserId,
  targetType = 'item',
  targetId,
  isOpen = true,
  onClose,
  onSuccess,
}: ReportDialogProps) {
  const { user } = useAuth()
  const userId = propUserId ?? user?.uid
  const dialogRef = useRef<HTMLDivElement>(null)
  const [reason, setReason] = useState<
    'spam' | 'harmful' | 'misleading' | 'other'
  >('spam')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus()
      setError(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) {
      setError('You must be signed in to submit a report.')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const { getFirebaseServices } = await import('@/lib/firebase')
      const { db } = getFirebaseServices()
      await submitReport(db, kind, itemId, userId, {
        reason,
        note: note.trim() || null,
        target_type: targetType,
        target_id: targetId,
      })
      onSuccess?.()
      onClose()
    } catch {
      setError('Could not submit report. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      onKeyDown={onKeyDown}
      tabIndex={-1}
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-slate-900/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-navy-800">
        <div className="flex items-center justify-between pb-4">
          <h2
            id="report-dialog-title"
            className="text-lg font-semibold text-slate-900 dark:text-white"
          >
            Report this {kind}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reason
            </legend>
            {REASONS.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-200"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="size-4 text-teal-600 focus:ring-teal-500"
                />
                {r.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label
              htmlFor="report-note"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
            >
              Optional note (max 500 characters)
            </label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Provide any additional context…"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-white/10 dark:bg-navy-900 dark:text-white"
            />
            <div className="mt-1 text-right text-xs text-slate-400">
              {note.length} / 500
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-teal-600 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
