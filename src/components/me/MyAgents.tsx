import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AgentDetailModal } from '@/components/detail/AgentDetailModal'
import {
  Notice,
  ReviewLabel,
  smallButton,
  StatusText,
  textLink,
  VisibilityLabel,
} from '@/components/studio/parts'
import { Link } from '@/router/Router'
import { lintManifest } from '@/lib/safetyLinter'
import { describeServiceError } from '@/lib/studioErrors'
import { hasBlock } from '@/lib/studioManifest'
import {
  getAgentRecord,
  listMyAgents,
  listMyPendingEdits,
  setAgentVisibility,
  withdrawPendingEdit,
} from '@/services/agents'
import type { AgentRecord } from '@/types/agent'
import { originLabel } from '@/lib/portability'
import { VisibilityChanger } from './VisibilityChanger'

const PAGE = 20

export function MyAgents() {
  const [items, setItems] = useState<AgentRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [edits, setEdits] = useState<Map<string, AgentRecord>>(new Map())
  const [open, setOpen] = useState<AgentRecord | null>(null)

  const loadPage = useCallback(async (after?: string) => {
    setLoading(true)
    setError('')
    try {
      const page = await listMyAgents(PAGE, after)
      setItems((current) => (after ? [...current, ...page.items] : page.items))
      setCursor(page.cursor && page.items.length === PAGE ? page.cursor : null)
    } catch (e) {
      setError(describeServiceError(e, 'list'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage()
    // Waiting edits: a few documents at most, read in pages of 50.
    let active = true
    ;(async () => {
      const found = new Map<string, AgentRecord>()
      let after: string | undefined
      for (let i = 0; i < 10; i++) {
        const page = await listMyPendingEdits(50, after)
        for (const edit of page.items) found.set(edit.id, edit)
        if (!page.cursor || page.items.length < 50) break
        after = page.cursor
      }
      if (active) setEdits(found)
    })().catch(() => {
      // The list still works without edit markers.
    })
    return () => {
      active = false
    }
  }, [loadPage])

  function replace(record: AgentRecord) {
    setItems((current) => current.map((r) => (r.id === record.id ? record : r)))
  }
  function dropEdit(id: string) {
    setEdits((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }

  if (!loading && !error && items.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-white/15">
        <p>You have not made an agent yet.</p>
        <p className="mt-2">
          <Link to="/studio" className={textLink}>
            Build one in the Manifest Studio
          </Link>
          . It walks you through each part, and you choose who can see it.
        </p>
      </div>
    )

  return (
    <div className="space-y-3">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <ul className="space-y-3">
        {items.map((record) => (
          <AgentRow
            key={record.id}
            record={record}
            edit={edits.get(record.id) ?? null}
            onOpen={() => setOpen(record)}
            onChanged={replace}
            onEditGone={() => dropEdit(record.id)}
          />
        ))}
      </ul>
      {loading && (
        <p className="inline-flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your agents…
        </p>
      )}
      {cursor && !loading && (
        <button
          type="button"
          className={smallButton}
          onClick={() => loadPage(cursor)}
        >
          Show more
        </button>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Agents cannot be deleted. To take one out of circulation, make it
        private.
      </p>
      {open && (
        <AgentDetailModal
          agent={open}
          onClose={() => setOpen(null)}
          installable={
            open.visibility === 'public' && open.review_status === 'approved'
          }
        />
      )}
    </div>
  )
}

function AgentRow({
  record,
  edit,
  onOpen,
  onChanged,
  onEditGone,
}: {
  record: AgentRecord
  edit: AgentRecord | null
  onOpen: () => void
  onChanged: (record: AgentRecord) => void
  onEditGone: () => void
}) {
  const [changing, setChanging] = useState<
    AgentRecord['visibility'] | 'any' | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const blocked = hasBlock(safeLint(record))

  async function applyVisibility(visibility: AgentRecord['visibility']) {
    setBusy(true)
    setError('')
    try {
      await setAgentVisibility(record.id, visibility)
      // Changing visibility removes any waiting edit.
      onEditGone()
      const fresh = await getAgentRecord(record.id)
      if (fresh) onChanged(fresh)
      setChanging(null)
      setMessage(
        visibility === 'public'
          ? 'Sent for review. Once a person approves it, it appears in the catalog within about an hour.'
          : record.visibility === 'public' &&
              record.review_status === 'approved'
            ? 'Changed. It leaves the public catalog on the next refresh, within about an hour.'
            : visibility === 'friends'
              ? 'Changed. Your friends can see it now.'
              : 'Changed. Only you can see it now.',
      )
    } catch (e) {
      setError(describeServiceError(e, 'visibility'))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    if (!edit) return
    const what =
      edit.review_status === 'rejected'
        ? `Remove the edit to version ${edit.version} that was not approved?`
        : `Withdraw your edit to version ${edit.version}? It leaves the review queue.`
    if (!window.confirm(what)) return
    setBusy(true)
    setError('')
    try {
      await withdrawPendingEdit(record.id)
      onEditGone()
      setMessage('The edit was withdrawn.')
    } catch (e) {
      setError(describeServiceError(e, 'withdraw'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-xl border border-slate-900/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-base font-semibold text-slate-900 dark:text-white">
          {record.name}
        </h3>
        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
          v{record.version}
        </span>
      </div>
      <p className="break-all font-mono text-xs text-slate-600 dark:text-slate-400">
        {record.id}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <VisibilityLabel visibility={record.visibility} />
        <ReviewLabel record={record} />
        {originLabel(record.origin_app, record.saved_from_chat) && (
          <StatusText tone="indigo">
            {originLabel(record.origin_app, record.saved_from_chat)}
          </StatusText>
        )}
        {edit &&
          (edit.review_status === 'rejected' ? (
            <StatusText tone="rose">
              Edit v{edit.version} not approved
            </StatusText>
          ) : (
            <StatusText tone="amber">Edit v{edit.version} waiting</StatusText>
          ))}
        {blocked && <StatusText tone="rose">Blocked finding</StatusText>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className={smallButton} onClick={onOpen}>
          Open
        </button>
        <Link
          to={`/studio?edit=${encodeURIComponent(record.id)}`}
          className={smallButton}
        >
          Edit
        </Link>
        <button
          type="button"
          className={smallButton}
          aria-expanded={changing !== null}
          onClick={() => setChanging(changing ? null : 'any')}
        >
          Change visibility
        </button>
        {record.visibility !== 'private' && (
          <button
            type="button"
            className={smallButton}
            onClick={() => setChanging('private')}
          >
            Make private
          </button>
        )}
        {edit && (
          <button
            type="button"
            className={smallButton}
            onClick={withdraw}
            disabled={busy}
          >
            {edit.review_status === 'rejected'
              ? 'Remove the edit'
              : 'Withdraw the edit'}
          </button>
        )}
      </div>
      {changing && (
        <VisibilityChanger
          record={record}
          edit={edit}
          blocked={blocked}
          initial={changing === 'any' ? null : changing}
          busy={busy}
          onCancel={() => setChanging(null)}
          onConfirm={applyVisibility}
        />
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        </div>
      )}
      {message && !error && (
        <p
          role="status"
          className="mt-3 text-sm text-teal-800 dark:text-teal-200"
        >
          {message}
        </p>
      )}
    </li>
  )
}

function safeLint(record: AgentRecord) {
  try {
    return lintManifest(record).findings
  } catch {
    return []
  }
}
