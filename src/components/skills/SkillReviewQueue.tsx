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
  FindingNote,
  Notice,
  primaryButton,
  secondaryButton,
  smallButton,
  StatusText,
  VisibilityLabel,
} from '@/components/studio/parts'
import { LINTER_VERSION } from '@/lib/safetyLinter'
import { formatBytes } from '@/lib/skillRepository'
import { utf8ByteLength } from '@/lib/skillSchema'
import { describeServiceError, isPermissionDenied } from '@/lib/studioErrors'
import * as skillsApi from '@/services/skills'
import { SKILL_PAGE_MAX } from '@/services/skills'
import type { SkillFile, SkillRecord } from '@/types/skill'
import { FileText, KindLabel } from './parts'
import { SkillDiff } from './SkillDiff'
import {
  fetchReviewPage,
  runReviewDecision,
  type ReviewKind,
} from './skillActions'
import { comparePaths, fileKey } from './skillDraft'
import { reviewFindings, type ReviewFindings } from './reviewFindings'

type Kind = ReviewKind

const TABS: { id: Kind; label: string; empty: string }[] = [
  {
    id: 'submission',
    label: 'New submissions',
    empty: 'No new skill submissions are waiting.',
  },
  { id: 'edit', label: 'Waiting edits', empty: 'No skill edits are waiting.' },
  {
    id: 'published',
    label: 'Published',
    empty: 'No skill has been approved yet.',
  },
]

const PAGE = SKILL_PAGE_MAX

export function SkillReviewQueue() {
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
        aria-label="Skill review lists"
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

function ReviewList({ kind, empty }: { kind: Kind; empty: string }) {
  const [items, setItems] = useState<SkillRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (after?: string) => {
      setLoading(true)
      setError('')
      try {
        const page = await fetchReviewPage(skillsApi, kind, PAGE, after)
        setItems((current) =>
          after ? [...current, ...page.items] : page.items,
        )
        setCursor(
          page.cursor && page.items.length === PAGE ? page.cursor : null,
        )
      } catch (e) {
        setError(describeServiceError(e, 'list', 'skill'))
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

function ReviewItem({ kind, record }: { kind: Kind; record: SkillRecord }) {
  const { user } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [live, setLive] = useState<SkillRecord | null | undefined>(undefined)
  const [liveError, setLiveError] = useState('')
  const [verified, setVerified] = useState(record.author.verified)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmTakeDown, setConfirmTakeDown] = useState(false)
  const panelId = useId()
  const review = reviewFindings(record)
  const { blocks, warns, issues } = review
  const own = user?.uid === record.owner_uid
  const stopped = blocks > 0 || issues.length > 0

  useEffect(() => {
    if (!expanded || kind !== 'edit' || live !== undefined) return
    let active = true
    skillsApi
      .getSkillRecord(record.id)
      .then((r) => {
        if (!active) return
        setLive(r)
        if (r) setVerified(r.author.verified)
      })
      .catch((e) => {
        if (!active) return
        setLive(null)
        setLiveError(describeServiceError(e, 'load', 'skill'))
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
          : describeServiceError(e, action, 'skill'),
      )
    } finally {
      setBusy(false)
    }
  }

  const approvedText = stopped
    ? 'Approved. While it breaks a skill rule or has a blocked finding, the export leaves it out, so it will not appear.'
    : 'Approved. It appears on the skills page within about an hour.'

  async function toggleVerified() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await skillsApi.setSkillAuthorVerified(record.id, !verified)
      setVerified(!verified)
      setMessage(
        !verified
          ? `Marked as ${VERIFIED_AUTHOR_LABEL}. That confirms who the author is; it is not a review of the skill.`
          : `${VERIFIED_AUTHOR_LABEL} removed.`,
      )
    } catch (e) {
      setError(describeServiceError(e, 'verify-author', 'skill'))
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
              {record.id} · @{record.author.handle}
              {own ? ' (you)' : ''} · {record.files.length}{' '}
              {record.files.length === 1 ? 'file' : 'files'}
            </span>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {issues.length > 0 && (
                <StatusText tone="rose">
                  {issues.length} rule{' '}
                  {issues.length === 1 ? 'problem' : 'problems'}
                </StatusText>
              )}
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
          {issues.length > 0 && (
            <Notice tone="error" title="This skill breaks the skill rules">
              <p>
                The export leaves it out while these stand, even if approved.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <code className="break-all font-mono text-xs">
                      {issue.path}
                    </code>
                    : {issue.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {blocks > 0 && (
            <Notice tone="error" title="This has a blocked finding">
              Approving will not publish it while the finding stands. The export
              leaves out anything with a blocked finding.
            </Notice>
          )}
          <p className="text-xs text-fg-muted">
            {blocks + warns === 0
              ? `The safety linter (version ${LINTER_VERSION}) has nothing to flag. That is not a safety check: read every file.`
              : `Safety linter version ${LINTER_VERSION}: ${blocks} blocked, ${warns} to check. Each one is shown beside its file below.`}
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
              {live && <SkillDiff live={live} edit={record} />}
            </section>
          )}

          <section>
            <h4 className="mb-2 text-base font-semibold text-fg">
              {kind === 'edit'
                ? 'The proposed version in full'
                : 'The skill in full'}
            </h4>
            <SkillReviewView
              record={{ ...record, author: { ...record.author, verified } }}
              review={review}
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
                        () =>
                          runReviewDecision(
                            skillsApi,
                            kind,
                            'approve',
                            record.id,
                          ),
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
                        () =>
                          runReviewDecision(
                            skillsApi,
                            kind,
                            'reject',
                            record.id,
                          ),
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
                        () =>
                          runReviewDecision(
                            skillsApi,
                            kind,
                            'approve',
                            record.id,
                          ),
                        stopped
                          ? approvedText
                          : `Approved. Version ${record.version} appears on the skills page within about an hour.`,
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
                        () =>
                          runReviewDecision(
                            skillsApi,
                            kind,
                            'reject',
                            record.id,
                          ),
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
                      Take down {record.name}? It leaves the skills page on the
                      next refresh, within about an hour, and the author sees it
                      as not approved.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={dangerButton}
                        disabled={busy}
                        onClick={() =>
                          act(
                            'take-down',
                            () =>
                              runReviewDecision(
                                skillsApi,
                                kind,
                                'take-down',
                                record.id,
                              ),
                            'Taken down. It leaves the skills page on the next refresh, within about an hour.',
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

/** Every field and every file, with each finding beside what it is about. */
export function SkillReviewView({
  record,
  review,
}: {
  record: SkillRecord
  review: ReviewFindings
}) {
  const files = [...record.files].sort(comparePaths)
  return (
    <div className="space-y-5 text-sm">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
        <dt className="font-medium text-fg">Name</dt>
        <dd className="min-w-0">
          <code className="break-all font-mono">{record.name}</code>
          <Findings list={review.byField('name')} />
        </dd>
        <dt className="font-medium text-fg">Id</dt>
        <dd className="min-w-0">
          <code className="break-all font-mono">{record.id}</code>
        </dd>
        <dt className="font-medium text-fg">Version</dt>
        <dd>
          <code className="font-mono">{record.version}</code>
        </dd>
        <dt className="font-medium text-fg">Visibility</dt>
        <dd>
          <VisibilityLabel visibility={record.visibility} />
        </dd>
        <dt className="font-medium text-fg">Author</dt>
        <dd className="min-w-0 break-words">
          @{record.author.handle} ({record.author.name}){' '}
          {record.author.verified ? (
            <StatusText tone="teal">{VERIFIED_AUTHOR_LABEL}</StatusText>
          ) : (
            <StatusText>Not marked {VERIFIED_AUTHOR_LABEL}</StatusText>
          )}
        </dd>
        <dt className="font-medium text-fg">Tags</dt>
        <dd className="min-w-0 break-words">
          {record.tags.map((t) => `#${t}`).join(' ')}
          <Findings list={review.byField('tags')} />
        </dd>
        <dt className="font-medium text-fg">Description</dt>
        <dd className="min-w-0 whitespace-pre-wrap break-words">
          {record.description}
          <Findings list={review.byField('description')} />
        </dd>
      </dl>
      <ul className="space-y-3" aria-label="Files">
        {files.map((file) => (
          <ReviewFile
            key={file.path}
            file={file}
            findings={review.byField(fileKey(file.path))}
          />
        ))}
      </ul>
    </div>
  )
}

function ReviewFile({
  file,
  findings,
}: {
  file: SkillFile
  findings: ReturnType<ReviewFindings['byField']>
}) {
  const [open, setOpen] = useState(file.kind === 'instructions')
  const panel = useId()
  return (
    <li className="rounded-3xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 break-all font-mono text-xs font-semibold text-fg">
          {file.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3">
          <KindLabel kind={file.kind} />
          <span className="font-mono text-xs tabular-nums text-fg-muted">
            {formatBytes(utf8ByteLength(file.content))}
          </span>
        </span>
      </div>
      <Findings list={findings} />
      <button
        type="button"
        className={cn(smallButton, 'mt-2')}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide the text' : 'Read the text'}
        <span className="sr-only"> of {file.path}</span>
      </button>
      {open && (
        <div id={panel} className="mt-2">
          <FileText text={file.content} label={`Text of ${file.path}`} />
        </div>
      )}
    </li>
  )
}

function Findings({ list }: { list: ReturnType<ReviewFindings['byField']> }) {
  if (!list.findings.length && !list.issues.length) return null
  return (
    <div className="mt-2 space-y-1.5">
      {list.issues.map((issue, i) => (
        <p key={`i${i}`} className="text-xs text-fg">
          {issue.message}
        </p>
      ))}
      {list.findings.map((f, i) => (
        <FindingNote key={`f${i}${f.rule}`} finding={f} />
      ))}
    </div>
  )
}
