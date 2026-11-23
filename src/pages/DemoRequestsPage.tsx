import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { PageHold, PageShell } from '@/components/PageShell'
import { DEMO_STATUSES, isDemoFounder, type DemoStatus } from '@/lib/demoRequest'
import {
  appendDemoNote,
  deleteDemoRequest,
  updateDemoRequest,
  watchDemoRequests,
  type DemoRequest,
} from '@/services/demoRequests'

const input =
  'w-full rounded-xl border border-slate-300 bg-transparent p-3 dark:border-white/20'
const button =
  'rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50'

export default function DemoRequestsPage() {
  const { user, status } = useAuth()
  if (status === 'restoring') return <PageHold />
  if (!isDemoFounder(user))
    return (
      <PageShell title="Access denied">
        <p>This page is private.</p>
      </PageShell>
    )
  return <Inbox key={user?.uid} />
}

function Inbox() {
  const [requests, setRequests] = useState<DemoRequest[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [oldest, setOldest] = useState(false)
  const [selected, setSelected] = useState('')
  useEffect(
    () =>
      watchDemoRequests(
        setRequests,
        () => {
          setRequests(null)
          setError('Could not load demo requests. Refresh to try again.')
        },
      ),
    [],
  )

  const term = search.trim().toLowerCase()
  const visible = (requests ?? [])
    .filter(
      (r) =>
        (filter === 'All' || r.status === filter) &&
        `${r.name} ${r.company}`.toLowerCase().includes(term),
    )
    .sort((a, b) =>
      oldest
        ? a.submittedAt.localeCompare(b.submittedAt)
        : b.submittedAt.localeCompare(a.submittedAt),
    )
  const current = requests?.find((r) => r.path === selected)

  return (
    <PageShell title="Demo Requests">
      <p className="mb-4">
        Private founder inbox ·{' '}
        {requests?.filter((r) => r.status === 'New').length ?? '—'} new
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className={input}
          aria-label="Search requests"
          placeholder="Search name or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={input}
          aria-label="Filter by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All</option>
          {DEMO_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <select
          className={input}
          aria-label="Sort by date"
          value={oldest ? 'oldest' : 'newest'}
          onChange={(e) => setOldest(e.target.value === 'oldest')}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {current && (
        <RequestDetails
          key={current.path}
          request={current}
          close={() => setSelected('')}
        />
      )}
      <div className="mt-5 space-y-2">
        {requests === null && !error && <p>Loading requests…</p>}
        {requests !== null && visible.length === 0 && (
          <p>No matching requests.</p>
        )}
        {visible.map((r) => (
          <button
            key={r.path}
            type="button"
            onClick={() => setSelected(r.path)}
            className="w-full rounded-xl border border-slate-500/20 p-4 text-left hover:bg-slate-500/10"
          >
            <span className="block font-semibold">
              {r.company} — {r.name}
            </span>
            <span className="text-sm">
              {r.status} · {formatDate(r.submittedAt)}
            </span>
          </button>
        ))}
      </div>
    </PageShell>
  )
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString() : 'Pending'
}

function RequestDetails({
  request,
  close,
}: {
  request: DemoRequest
  close: () => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function change(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch {
      setError('Could not save changes. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-5 space-y-3 rounded-xl border border-slate-500/20 p-4">
      <div className="flex justify-between gap-4">
        <h2 className="text-xl font-semibold">{request.company}</h2>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
      <p>
        {request.name} · {request.position}
      </p>
      <a
        className="break-all underline"
        href={`mailto:${encodeURIComponent(request.email)}`}
      >
        {request.email}
      </a>
      <p>Company size: {request.size || 'Not supplied'}</p>
      <p>Submitted: {formatDate(request.submittedAt)}</p>
      <h3 className="font-semibold">Business needs</h3>
      <p className="whitespace-pre-wrap break-words">{request.description}</p>
      <label className="block space-y-1">
        <span>Status</span>
        <select
          className={input}
          value={request.status}
          disabled={busy}
          onChange={(e) =>
            void change(() =>
              updateDemoRequest(request.path, {
                status: e.target.value as DemoStatus,
              }),
            )
          }
        >
          {DEMO_STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>
      <h3 className="font-semibold">Internal notes</h3>
      <p className="whitespace-pre-wrap break-words">
        {request.notes || 'No notes yet.'}
      </p>
      <textarea
        className={input}
        aria-label="Add internal note"
        placeholder="Add a confidential note"
        value={note}
        maxLength={1000}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || !note.trim()}
          onClick={() =>
            void change(async () => {
              await appendDemoNote(request.path, note)
              setNote('')
            })
          }
        >
          Add note
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() =>
            void change(() =>
              updateDemoRequest(request.path, { status: 'Archived' }),
            )
          }
        >
          Archive
        </button>
        <button
          type="button"
          className="rounded-xl border border-rose-500 px-4 py-2 text-rose-600 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Permanently delete this request?'))
              void change(async () => {
                await deleteDemoRequest(request.path)
                close()
              })
          }}
        >
          Delete
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
