import { displayAuthorHandle } from '@/lib/authorBranding'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { cn, VERIFIED_AUTHOR_LABEL } from '@/components/ui'
import {
  dangerButton,
  Notice,
  primaryButton,
  secondaryButton,
  smallButton,
  StatusText,
} from '@/components/studio/parts'
import {
  LINTER_VERSION,
  lintManifest,
  type LintFinding,
} from '@/lib/safetyLinter'
import { describeServiceError, isPermissionDenied } from '@/lib/studioErrors'
import { dottedPath } from '@/lib/studioManifest'
import {
  getAgentRecord,
  listEditQueue,
  listReviewQueue,
  reviewAgent,
  reviewEdit,
  setAuthorVerified,
} from '@/services/agents'
import type { AgentRecord } from '@/types/agent'
import { ManifestDiff } from './ManifestDiff'
import { ManifestView } from './ManifestView'

type Kind = 'submission' | 'edit' | 'published'

const TABS: { id: Kind; label: string; empty: string }[] = [
  {
    id: 'submission',
    label: 'New submissions',
    empty: 'No new submissions are waiting.',
  },
  { id: 'edit', label: 'Waiting edits', empty: 'No edits are waiting.' },
  {
    id: 'published',
    label: 'Published',
    empty: 'Nothing has been approved yet.',
  },
]

const PAGE = 20

export function ReviewQueue() {
  const [tab, setTab] = useState<Kind>('submission')
  const [opened, setOpened] = useState<Set<Kind>>(() => new Set(['submission']))
  const base = useId()

  function select(id: Kind) {
    setTab(id)
    setOpened((current) => new Set(current).add(id))
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab)
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = TABS[(index + delta + TABS.length) % TABS.length]
    select(next.id)
    document.getElementById(`${base}-tab-${next.id}`)?.focus()
  }

  return (
    <div className="mt-4 text-sm">
      <div
        role="tablist"
        aria-label="Review lists"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`${base}-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-2 py-2.5 text-sm font-medium transition sm:px-3',
              tab === t.id
                ? 'border-accent-fg text-accent-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={tab !== t.id}
          className="pt-4"
        >
          {opened.has(t.id) && <ReviewList kind={t.id} empty={t.empty} />}
        </div>
      ))}
    </div>
  )
}

function fetchPage(kind: Kind, after?: string) {
  if (kind === 'edit') return listEditQueue('pending', PAGE, after)
  return listReviewQueue(
    kind === 'published' ? 'approved' : 'pending',
    PAGE,
    after,
  )
}

function ReviewList({ kind, empty }: { kind: Kind; empty: string }) {
  const [items, setItems] = useState<AgentRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (after?: string) => {
      setLoading(true)
      setError('')
      try {
        const page = await fetchPage(kind, after)
        setItems((current) =>
          after ? [...current, ...page.items] : page.items,
        )
        setCursor(
          page.cursor && page.items.length === PAGE ? page.cursor : null,
        )
      } catch (e) {
        setError(describeServiceError(e, 'list'))
      } finally {
        setLoading(false)
      }
    },
    [kind],
  )

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="rounded-3xl bg-surface p-6 text-center text-fg-muted">
          {empty}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((record) => (
          <ReviewItem key={record.id} kind={kind} record={record} />
        ))}
      </ul>
      {loading && (
        <p className="inline-flex items-center gap-2" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading…
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {cursor && !loading && (
          <button
            type="button"
            className={smallButton}
            onClick={() => load(cursor)}
          >
            Show more
          </button>
        )}
        {!loading && (
          <button type="button" className={smallButton} onClick={() => load()}>
            Refresh the list
          </button>
        )}
      </div>
    </div>
  )
}

function lint(record: AgentRecord): LintFinding[] {
  try {
    return lintManifest(record).findings.map((f) => ({
      ...f,
      path: dottedPath(f.path),
    }))
  } catch {
    return []
  }
}

function ReviewItem({ kind, record }: { kind: Kind; record: AgentRecord }) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState<AgentRecord | null | undefined>(undefined)
  const [liveError, setLiveError] = useState('')
  const [verified, setVerified] = useState(record.author.verified)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmTakeDown, setConfirmTakeDown] = useState(false)
  const panelId = useId()
  const findings = lint(record)
  const blocks = findings.filter((f) => f.severity === 'block').length
  const warns = findings.length - blocks
  const own = user?.uid === record.owner_uid

  useEffect(() => {
    if (!expanded || kind !== 'edit' || live !== undefined) return
    let active = true
    getAgentRecord(record.id)
      .then((r) => {
        if (!active) return
        setLive(r)
        if (r) setVerified(r.author.verified)
      })
      .catch((e) => {
        if (!active) return
        setLive(null)
        setLiveError(describeServiceError(e, 'load'))
      })
    return () => {
      active = false
    }
  }, [expanded, kind, live, record.id])

  async function act(
    action: 'approve' | 'reject' | 'take-down',
    run: () => Promise<void>,
    success: string,
  ) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await run()
      setDone(success)
    } catch (e) {
      setError(
        action === 'approve' && own && isPermissionDenied(e)
          ? 'Reviewers cannot approve their own work on this site. Another reviewer needs to approve it.'
          : describeServiceError(e, action),
      )
    } finally {
      setBusy(false)
    }
  }

  const approvedText = blocks
    ? 'Approved. While its blocked finding stands, the catalog build leaves it out, so it will not appear.'
    : 'Approved. It appears in the catalog within about an hour.'

  async function toggleVerified() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await setAuthorVerified(record.id, !verified)
      setVerified(!verified)
      setMessage(
        !verified
          ? `Marked as ${VERIFIED_AUTHOR_LABEL}. That confirms who the author is; it is not a review of the agent.`
          : `${VERIFIED_AUTHOR_LABEL} removed.`,
      )
    } catch (e) {
      setError(describeServiceError(e, 'verify-author'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-3xl bg-surface">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-start gap-2 rounded-3xl px-5 py-4 text-left hover:bg-surface-2"
        >
          {expanded ? (
            <ChevronDown
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <ChevronRight
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="block break-words font-semibold text-fg">
              {record.name}{' '}
              <span className="font-mono text-xs font-normal text-fg-muted">
                v{record.version}
              </span>
            </span>
            <span className="block break-all text-xs text-fg-muted">
              {record.id} · @{displayAuthorHandle(record.author.handle)}
              {own ? ' (you)' : ''}
            </span>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {blocks > 0 && (
                <StatusText tone="rose">{blocks} blocked</StatusText>
              )}
              {warns > 0 && (
                <StatusText tone="amber">{warns} to check</StatusText>
              )}
              {done && <StatusText tone="teal">Handled</StatusText>}
            </span>
          </span>
        </button>
      </h3>

      {expanded && (
        <div id={panelId} className="space-y-4 px-4 pb-4 pt-2">
          {blocks > 0 && (
            <Notice tone="error" title="This has a blocked finding">
              Approving will not publish it while the finding stands. The
              catalog build leaves out anything with a blocked finding.
            </Notice>
          )}
          <p className="text-xs text-fg-muted">
            {findings.length === 0
              ? `The safety linter (version ${LINTER_VERSION}) has nothing to flag. That is not a safety check: read the whole manifest.`
              : `Safety linter version ${LINTER_VERSION}: ${blocks} blocked, ${warns} to check. Each one is shown beside its field below.`}
          </p>

          {kind === 'edit' && (
            <section>
              <h4 className="mb-2 text-base font-semibold text-fg">
                Changes from the live version
              </h4>
              {live === undefined && (
                <p role="status">Loading the live version…</p>
              )}
              {live === null && (
                <Notice tone="warn">
                  {liveError || 'The live version could not be found.'}
                </Notice>
              )}
              {live && <ManifestDiff live={live} edit={record} />}
            </section>
          )}

          <section>
            <h4 className="mb-2 text-base font-semibold text-fg">
              {kind === 'edit'
                ? 'The proposed version in full'
                : 'Agent Details'}
            </h4>
            <ManifestView
              manifest={{ ...record, author: { ...record.author, verified } }}
              findings={findings}
            />
          </section>

          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          {message && (
            <p role="status" className="text-accent-fg">
              {message}
            </p>
          )}
          {done ? (
            <Notice tone="success" role="status">
              {done}
            </Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kind === 'submission' && (
                <>
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy}
                    onClick={() =>
                      act(
                        'approve',
                        () => reviewAgent(record.id, 'approved'),
                        approvedText,
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() =>
                      act(
                        'reject',
                        () => reviewAgent(record.id, 'rejected'),
                        'Rejected. The author sees it as not approved.',
                      )
                    }
                  >
                    Reject
                  </button>
                </>
              )}
              {kind === 'edit' && (
                <>
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={busy}
                    onClick={() =>
                      act(
                        'approve',
                        () => reviewEdit(record.id, 'approved'),
                        blocks
                          ? approvedText
                          : `Approved. Version ${record.version} appears in the catalog within about an hour.`,
                      )
                    }
                  >
                    Approve the edit
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() =>
                      act(
                        'reject',
                        () => reviewEdit(record.id, 'rejected'),
                        `Rejected. ${live ? `Version ${live.version}` : 'The live version'} stays live.`,
                      )
                    }
                  >
                    Reject the edit
                  </button>
                </>
              )}
              {kind === 'published' &&
                (confirmTakeDown ? (
                  <div className="w-full space-y-2 rounded-3xl bg-surface-2 p-4">
                    <p>
                      Take down {record.name}? It leaves the catalog on the next
                      refresh, within about an hour, and the author sees it as
                      not approved.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={dangerButton}
                        disabled={busy}
                        onClick={() =>
                          act(
                            'take-down',
                            () => reviewAgent(record.id, 'rejected'),
                            'Taken down. It leaves the catalog on the next refresh, within about an hour.',
                          )
                        }
                      >
                        Take it down
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => setConfirmTakeDown(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={dangerButton}
                    onClick={() => setConfirmTakeDown(true)}
                  >
                    Take down
                  </button>
                ))}
              <button
                type="button"
                className={secondaryButton}
                disabled={busy || (kind === 'edit' && !live)}
                onClick={toggleVerified}
              >
                {verified
                  ? `Remove ${VERIFIED_AUTHOR_LABEL}`
                  : `Mark as ${VERIFIED_AUTHOR_LABEL}`}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
