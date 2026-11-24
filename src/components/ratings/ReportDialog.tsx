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
        className="fixed inset-0 bg-page/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-[var(--lm-shadow)]">
        <div className="flex items-center justify-between pb-4">
          <h2
            id="report-dialog-title"
            className="text-lg font-semibold text-fg"
          >
            Report this {kind}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full text-fg-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Reason
            </legend>
            {REASONS.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-3 text-sm text-fg"
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="size-4 accent-[var(--lm-accent)] focus:ring-2 focus:ring-accent-fg"
                />
                {r.label}
              </label>
            ))}
          </fieldset>

          <div>
            <label
              htmlFor="report-note"
              className="block text-xs font-semibold uppercase tracking-wider text-fg-muted"
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
              className="mt-1 w-full rounded-2xl border border-line bg-surface p-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent-fg"
            />
            <div className="mt-1 text-right text-xs text-fg-muted">
              {note.length} / 500
            </div>
          </div>

          {error && <p className="text-xs text-fg">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full bg-surface px-5 text-sm font-medium text-fg transition hover:-translate-y-0.5 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_var(--lm-accent)] disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
