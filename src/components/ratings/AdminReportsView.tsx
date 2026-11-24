import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { smallButton } from '@/components/studio/parts'
import { Link } from '@/router/Router'
import {
  deleteItemReports,
  listReports,
  type ReportedItemSummary,
} from '@/services/ratings'

export function AdminReportsView() {
  const [reports, setReports] = useState<ReportedItemSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [handlingKey, setHandlingKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    import('@/lib/firebase')
      .then(({ getFirebaseServices }) => {
        const { db } = getFirebaseServices()
        return listReports(db)
      })
      .then((data) => {
        if (active) {
          setReports(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Could not load reports.',
          )
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function markHandled(item: ReportedItemSummary) {
    if (!window.confirm('Mark these reports handled? They will be removed.'))
      return

    const key = `${item.kind}:${item.id}`
    setHandlingKey(key)
    setActionError(null)
    try {
      const { getFirebaseServices } = await import('@/lib/firebase')
      await deleteItemReports(getFirebaseServices().db, item.kind, item.id)
      setReports(
        (current) =>
          current?.filter(
            (reported) =>
              reported.kind !== item.kind || reported.id !== item.id,
          ) ?? null,
      )
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not mark reports handled.',
      )
    } finally {
      setHandlingKey(null)
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 py-8 text-sm text-fg-muted"
        role="status"
      >
        <Loader2 className="size-4 animate-spin" />
        Loading reports…
      </div>
    )
  }

  if (error) {
    return <p className="py-4 text-sm text-fg">{error}</p>
  }

  if (!reports || reports.length === 0) {
    return <p className="py-8 text-sm text-fg-muted">No reported items.</p>
  }

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-fg-muted">
        Reported items ordered by report count. Review reported items and take
        down violating public submissions through the review queue. Mark
        resolved reports handled to remove them.
      </p>

      {actionError ? (
        <p className="text-sm text-fg" role="alert">
          {actionError}
        </p>
      ) : null}

      <ul className="space-y-3" aria-label="Reported items">
        {reports.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            className="rounded-3xl bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">
                  {item.kind}
                </span>
                <h4 className="text-base font-semibold text-fg">{item.id}</h4>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-fg">
                  {item.count} {item.count === 1 ? 'report' : 'reports'}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-fg-muted">
              {item.reasons.spam ? (
                <span className="rounded-full bg-surface-2 px-3 py-1">
                  Spam: {item.reasons.spam}
                </span>
              ) : null}
              {item.reasons.harmful ? (
                <span className="rounded-full bg-surface-2 px-3 py-1">
                  Harmful: {item.reasons.harmful}
                </span>
              ) : null}
              {item.reasons.misleading ? (
                <span className="rounded-full bg-surface-2 px-3 py-1">
                  Misleading: {item.reasons.misleading}
                </span>
              ) : null}
              {item.reasons.other ? (
                <span className="rounded-full bg-surface-2 px-3 py-1">
                  Other: {item.reasons.other}
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-medium">
              <Link
                to={
                  item.kind === 'agent'
                    ? `/?agent=${item.id}`
                    : `/skills/${item.id}`
                }
                className="text-accent-fg hover:underline"
              >
                View {item.kind}
              </Link>
              <button
                type="button"
                className={smallButton}
                disabled={handlingKey !== null}
                onClick={() => markHandled(item)}
              >
                {handlingKey === `${item.kind}:${item.id}` ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Handling…
                  </>
                ) : (
                  'Mark handled'
                )}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
