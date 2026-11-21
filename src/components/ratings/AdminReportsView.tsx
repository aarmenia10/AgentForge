import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from '@/router/Router'
import { listReports, type ReportedItemSummary } from '@/services/ratings'

export function AdminReportsView() {
  const [reports, setReports] = useState<ReportedItemSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 py-8 text-sm text-slate-500"
        role="status"
      >
        <Loader2 className="size-4 animate-spin" />
        Loading reports…
      </div>
    )
  }

  if (error) {
    return (
      <p className="py-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <p className="py-8 text-sm text-slate-500 dark:text-slate-400">
        No reported items.
      </p>
    )
  }

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Reported items ordered by report count. Review reported items and take
        down violating public submissions through the review queue. To clear
        resolved reports, remove the report documents via the Firebase console.
      </p>

      <ul className="space-y-3" aria-label="Reported items">
        {reports.map((item) => (
          <li
            key={`${item.kind}:${item.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-navy-800"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {item.kind}
                </span>
                <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                  {item.id}
                </h4>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {item.count} {item.count === 1 ? 'report' : 'reports'}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
              {item.reasons.spam ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-white/10">
                  Spam: {item.reasons.spam}
                </span>
              ) : null}
              {item.reasons.harmful ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-white/10">
                  Harmful: {item.reasons.harmful}
                </span>
              ) : null}
              {item.reasons.misleading ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-white/10">
                  Misleading: {item.reasons.misleading}
                </span>
              ) : null}
              {item.reasons.other ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-white/10">
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
                className="text-teal-600 hover:underline dark:text-teal-400"
              >
                View {item.kind}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
