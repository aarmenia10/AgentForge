import { Loader2 } from 'lucide-react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/components/ui'
import { Link, useRoute } from '@/router/Router'
import { manifestSchema } from '@/lib/manifestSchema'
import { lintManifest, type LintFinding } from '@/lib/safetyLinter'
import { describeServiceError } from '@/lib/studioErrors'
import {
  clearStoredDraft,
  dottedPath,
  draftStorageKey,
  draftToManifest,
  emptyDraft,
  hasBlock,
  isHigherVersion,
  nextPatch,
  pathLabel,
  plainIssue,
  PLACEHOLDER_IDENTITY,
  readStoredDraft,
  recordToDraft,
  stepOf,
  within,
  writeStoredDraft,
  type Identity,
  type Problem,
  type StepId,
  type StoredDraft,
  type StudioDraft,
} from '@/lib/studioManifest'
import {
  createAgent,
  getAgentRecord,
  getPendingEdit,
  updateAgent,
} from '@/services/agents'
import { getProfile, type UserProfile } from '@/services/profiles'
import type { AgentRecord } from '@/types/agent'
import type { StepProps } from './context'
import {
  Notes,
  Notice,
  NO_FINDINGS_TEXT,
  primaryButton,
  secondaryButton,
  smallButton,
  textLink,
} from './parts'
import { StepBasics, StepPrompt, StepTools } from './Steps'
import { StepIO } from './StepIO'
import { StepVisibility } from './StepVisibility'

type ValidatorModule = typeof import('@/lib/validateManifest')

const STEPS: { id: StepId; label: string }[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'prompt', label: 'Agent Instructions' },
  { id: 'tools', label: 'Required Tools' },
  { id: 'io', label: 'Input and output' },
  { id: 'visibility', label: 'Visibility' },
]

/** A message carried across the remount that follows a first save. */
let flash: string | null = null

type Load =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

export function Studio({ editId }: { editId: string | null }) {
  const { user, needsEmailVerification, sendVerificationEmail, refreshUser } =
    useAuth()
  const { go } = useRoute()
  const storageKey = draftStorageKey(editId)
  const editing = editId !== null

  const [load, setLoad] = useState<Load>(() =>
    editing ? { state: 'loading' } : { state: 'ready' },
  )
  const [live, setLive] = useState<AgentRecord | null>(null)
  const [pendingEdit, setPendingEdit] = useState<AgentRecord | null>(null)
  const [draft, setDraft] = useState<StudioDraft>(() => {
    if (editing) return emptyDraft()
    return readStoredDraft(storageKey)?.draft ?? emptyDraft()
  })
  const [restoredNew] = useState(
    () => !editing && readStoredDraft(storageKey) !== null,
  )
  const [restoreOffer, setRestoreOffer] = useState<StoredDraft | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const baseline = useRef<string>(editing ? 'null' : draftText(emptyDraft()))
  const [profile, setProfile] = useState<UserProfile | null | undefined>(
    undefined,
  )
  const [profileError, setProfileError] = useState('')
  const [validator, setValidator] = useState<ValidatorModule | null>(null)
  const [step, setStep] = useState<StepId>('basics')
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState<string | null>(() => {
    const message = flash
    flash = null
    return message
  })
  const [catalogIds, setCatalogIds] = useState<Set<string> | null>(null)
  const [verifyNote, setVerifyNote] = useState('')
  const stepHeading = useRef<HTMLHeadingElement>(null)

  /* ----- loading ----- */

  useEffect(() => {
    let active = true
    import('@/lib/validateManifest')
      .then((module) => active && setValidator(module))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    getProfile(user.uid)
      .then((p) => active && setProfile(p))
      .catch((error) => {
        if (!active) return
        setProfile(null)
        setProfileError(describeServiceError(error, 'load'))
      })
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (editing) return
    // The public catalog is a static file, so this costs no database reads.
    let active = true
    fetch('/catalog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id?: unknown }[]) => {
        if (active && Array.isArray(list))
          setCatalogIds(new Set(list.map((a) => String(a.id))))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [editing])

  useEffect(() => {
    if (!editId || !user) return
    let active = true
    Promise.all([getAgentRecord(editId), getPendingEdit(editId)])
      .then(([record, edit]) => {
        if (!active) return
        if (!record) {
          setLoad({
            state: 'error',
            message: 'There is no agent with that id that you can edit.',
          })
          return
        }
        if (record.owner_uid !== user.uid) {
          setLoad({
            state: 'error',
            message: 'You can only edit your own agents.',
          })
          return
        }
        setLive(record)
        setPendingEdit(edit)
        const source = edit ?? record
        const loaded = recordToDraft(source)
        baseline.current = draftText(loaded)
        setBase(source.stats.updated_at)
        setDraft(loaded)
        const stored = readStoredDraft(storageKey)
        if (stored && draftText(stored.draft) !== baseline.current)
          setRestoreOffer(stored)
        setLoad({ state: 'ready' })
      })
      .catch((error) => {
        if (active)
          setLoad({
            state: 'error',
            message: describeServiceError(error, 'load'),
          })
      })
    return () => {
      active = false
    }
  }, [editId, user, storageKey])

  /* ----- keep an unsaved draft ----- */

  const dirty = draftText(draft) !== baseline.current
  useEffect(() => {
    if (load.state !== 'ready' || restoreOffer) return
    const timer = window.setTimeout(() => {
      if (dirty)
        writeStoredDraft(storageKey, {
          savedAt: new Date().toISOString(),
          base,
          draft,
        })
      else clearStoredDraft(storageKey)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, load.state, restoreOffer, storageKey, base])

  const update = useCallback((patch: Partial<StudioDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setSaved(null)
    setSaveError('')
  }, [])
  const touch = useCallback((path: string) => {
    setTouched((current) =>
      current.has(path) ? current : new Set(current).add(path),
    )
  }, [])

  /* ----- live checks ----- */

  const checked = useDeferredValue(draft)
  const identity: Identity = profile
    ? { uid: profile.uid, name: profile.display_name, handle: profile.handle }
    : PLACEHOLDER_IDENTITY
  const liveApproved =
    live?.visibility === 'public' && live.review_status === 'approved'

  const { problems, findings } = useMemo(() => {
    const built = draftToManifest(checked, identity)
    const list: Problem[] = [...built.problems]
    const parsed = manifestSchema.safeParse(built.manifest)
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const problem = plainIssue(issue)
        // The builder already explained schema trouble in its own words.
        if (
          stepOf(problem.path) === 'io' &&
          list.some((p) => within(p.path, problem.path.split('.')[0]))
        )
          continue
        if (!list.some((p) => p.path === problem.path)) list.push(problem)
      }
    if (validator)
      for (const root of ['input_schema', 'output_schema'] as const) {
        if (list.some((p) => within(p.path, root))) continue
        try {
          validator.createSchemaValidator().compile(built.manifest[root])
        } catch {
          list.push({
            path: root,
            message:
              'This JSON Schema does not work. Check the keyword names and their values.',
          })
        }
      }
    if (!editing && catalogIds?.has(built.manifest.id))
      list.push({
        path: 'id',
        message:
          'An agent in the public catalog already uses this id. Choose another one.',
      })
    if (liveApproved && live && !list.some((p) => p.path === 'version'))
      if (!isHigherVersion(built.manifest.version, live.version))
        list.push({
          path: 'version',
          message: `Use a version higher than ${live.version}, the one that is live now. The next patch number is ${nextPatch(live.version)}.`,
        })
    let lint: LintFinding[]
    try {
      lint = lintManifest(built.manifest).findings.map((f) => ({
        ...f,
        path: dottedPath(f.path),
      }))
    } catch {
      lint = []
    }
    return { problems: list, findings: lint }
    // identity is derived from profile, so profile stands in for it here.
  }, [checked, profile, validator, catalogIds, editing, liveApproved, live])

  const visible = useCallback(
    (problem: Problem) =>
      showAll || [...touched].some((t) => within(problem.path, t)),
    [showAll, touched],
  )
  const problemsWithin = useCallback(
    (path: string) =>
      problems.filter((p) => within(p.path, path) && visible(p)),
    [problems, visible],
  )
  const findingsWithin = useCallback(
    (path: string) => findings.filter((f) => within(f.path, path)),
    [findings],
  )
  const notes = useCallback(
    (path: string): ReactNode => (
      <Notes
        problems={problems.filter((p) => p.path === path && visible(p))}
        findings={findings.filter((f) => f.path === path)}
      />
    ),
    [problems, findings, visible],
  )

  const blocked = hasBlock(findings)
  const stale = checked !== draft

  /* ----- saving ----- */

  const saveLabel = (() => {
    if (draft.visibility === 'private') return 'Save privately'
    if (draft.visibility === 'friends') return 'Save and share with friends'
    if (liveApproved) return 'Submit the edit for review'
    return 'Submit for public review'
  })()

  async function save() {
    setShowAll(true)
    setSaveError('')
    setSaved(null)
    if (stale || problems.length || needsEmailVerification || !profile) {
      if (stale)
        setSaveError('Still checking your changes. Press the button again.')
      return
    }
    if (blocked && draft.visibility !== 'private') return
    setSaving(true)
    try {
      const final = (
        validator ?? (await import('@/lib/validateManifest'))
      ).validateManifest(draftToManifest(draft, identity).manifest)
      let message: string
      if (!editing) {
        await createAgent(final)
        message = savedMessage(final.visibility, false, null)
        clearStoredDraft(storageKey)
        flash = message
        go(`/studio?edit=${encodeURIComponent(final.id)}`, { replace: true })
        return
      }
      const { staged } = await updateAgent(final)
      message = savedMessage(final.visibility, staged, live)
      clearStoredDraft(storageKey)
      baseline.current = draftText(draft)
      const [record, edit] = await Promise.all([
        getAgentRecord(final.id),
        getPendingEdit(final.id),
      ])
      if (record) setLive(record)
      setPendingEdit(edit)
      setSaved(message)
    } catch (error) {
      setSaveError(describeServiceError(error, 'save'))
    } finally {
      setSaving(false)
    }
  }

  /* ----- rendering ----- */

  if (load.state === 'loading')
    return (
      <p className="mt-4 inline-flex items-center gap-2" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading the agent…
      </p>
    )
  if (load.state === 'error')
    return (
      <div className="mt-4 space-y-3">
        <Notice tone="error" role="alert">
          {load.message}
        </Notice>
        <p>
          <Link to="/me" className={textLink}>
            Go to My agents
          </Link>{' '}
          or{' '}
          <Link to="/studio" className={textLink}>
            build a new agent
          </Link>
          .
        </p>
      </div>
    )

  const stepProps: StepProps = {
    draft,
    update,
    touch,
    notes,
    problemsWithin,
    findingsWithin,
    editing,
  }
  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const visibleProblems = problems.filter(visible)
  const blockCount = findings.filter((f) => f.severity === 'block').length
  const warnCount = findings.length - blockCount

  function goToStep(id: StepId) {
    setStep(id)
    window.requestAnimationFrame(() => stepHeading.current?.focus())
  }
  function next(delta: number) {
    // Leaving a step shows what is still missing on it.
    for (const p of problems) if (stepOf(p.path) === step) touch(p.path)
    goToStep(STEPS[stepIndex + delta].id)
  }

  return (
    <div className="mt-4 space-y-6 text-sm">
      <EditBanner
        live={live}
        pendingEdit={pendingEdit}
        draft={draft}
        update={update}
      />

      {restoredNew && dirty && (
        <Notice>
          <p>Your unsaved draft was restored.</p>
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (!window.confirm('Clear the form and start a new agent?'))
                return
              clearStoredDraft(storageKey)
              setDraft(emptyDraft())
              setTouched(new Set())
              setShowAll(false)
              setStep('basics')
            }}
          >
            Start over
          </button>
        </Notice>
      )}
      {restoreOffer && (
        <Notice tone="warn" title="You have unsaved changes to this agent">
          <p>
            They are from {new Date(restoreOffer.savedAt).toLocaleString()}.
            {restoreOffer.base !== base &&
              ' The agent has been saved since then, so check them before saving.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                setDraft(restoreOffer.draft)
                setRestoreOffer(null)
              }}
            >
              Restore my changes
            </button>
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                clearStoredDraft(storageKey)
                setRestoreOffer(null)
              }}
            >
              Discard them
            </button>
          </div>
        </Notice>
      )}

      <nav aria-label="Studio steps">
        <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
          {STEPS.map((s, i) => {
            const stepProblems = visibleProblems.filter(
              (p) => stepOf(p.path) === s.id,
            )
            const stepFindings = findings.filter((f) => stepOf(f.path) === s.id)
            const stepBlocked = stepFindings.some((f) => f.severity === 'block')
            const current = s.id === step
            const status = [
              stepProblems.length ? `${stepProblems.length} to fix` : '',
              stepBlocked ? 'blocked' : stepFindings.length ? 'to check' : '',
            ]
              .filter(Boolean)
              .join(', ')
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goToStep(s.id)}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-full border px-3 py-2 text-left transition',
                    current
                      ? 'border-accent-fg bg-accent/10'
                      : 'border-transparent hover:bg-surface-2',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                      current
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface-2 text-fg',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-fg">
                      <span className="sr-only">Step {i + 1}: </span>
                      {s.label}
                    </span>
                    {status && (
                      <span
                        className={cn(
                          'block text-[11px]',
                          stepProblems.length || stepBlocked
                            ? 'text-fg'
                            : 'text-fg-muted',
                        )}
                      >
                        {status}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <section
        aria-labelledby="studio-step-title"
        className="rounded-3xl bg-surface p-5 sm:p-6"
      >
        <h2
          id="studio-step-title"
          ref={stepHeading}
          tabIndex={-1}
          className="mb-4 text-lg font-semibold text-fg outline-none"
        >
          {stepIndex + 1}. {STEPS[stepIndex].label}
        </h2>
        {step === 'basics' && <StepBasics {...stepProps} />}
        {step === 'prompt' && <StepPrompt {...stepProps} />}
        {step === 'tools' && <StepTools {...stepProps} />}
        {step === 'io' && <StepIO {...stepProps} />}
        {step === 'visibility' && (
          <StepVisibility {...stepProps} liveIsPublic={liveApproved} />
        )}
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => next(-1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}
          {stepIndex < STEPS.length - 1 && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => next(1)}
            >
              Next: {STEPS[stepIndex + 1].label}
            </button>
          )}
        </div>
      </section>

      <section
        aria-labelledby="studio-save-title"
        className="space-y-3 rounded-3xl bg-surface p-5 sm:p-6"
      >
        <h2 id="studio-save-title" className="text-lg font-semibold text-fg">
          Save
        </h2>

        <p className="text-xs text-fg-muted">
          {findings.length === 0
            ? NO_FINDINGS_TEXT
            : `The safety linter flagged ${blockCount ? `${blockCount} item${blockCount > 1 ? 's' : ''} that block${blockCount > 1 ? '' : 's'} sharing` : ''}${blockCount && warnCount ? ' and ' : ''}${warnCount ? `${warnCount} item${warnCount > 1 ? 's' : ''} for a reviewer to check` : ''}. Each one is shown beside its field.`}
        </p>

        {needsEmailVerification && (
          <Notice tone="warn" title="Confirm your email before you save">
            <p>
              We sent a link to {user?.email ?? 'your address'}. Open it, then
              come back here.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  sendVerificationEmail()
                    .then(() => setVerifyNote('Sent. Check your inbox.'))
                    .catch(() =>
                      setVerifyNote(
                        'Could not send the email. Try again in a minute.',
                      ),
                    )
                }
              >
                Send the email again
              </button>
              <button
                type="button"
                className={smallButton}
                onClick={() =>
                  refreshUser()
                    .then((u) =>
                      setVerifyNote(
                        u?.emailVerified
                          ? ''
                          : 'Not confirmed yet. Open the link in the email first.',
                      ),
                    )
                    .catch(() => setVerifyNote('Could not check. Try again.'))
                }
              >
                I have confirmed it
              </button>
            </div>
            {verifyNote && <p role="status">{verifyNote}</p>}
          </Notice>
        )}

        {profile === null && (
          <Notice tone="warn" title="Choose your username first">
            <p>
              {profileError ||
                'Agents are published under your username, and you have not picked one yet.'}{' '}
              <Link to="/settings" className={textLink}>
                Choose your username in Settings
              </Link>
              .
            </p>
          </Notice>
        )}

        {showAll && problems.length > 0 && (
          <Notice
            tone="error"
            title={`Fix ${problems.length} thing${problems.length > 1 ? 's' : ''} before saving`}
          >
            <ul className="space-y-1">
              {problems.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="text-left underline underline-offset-2"
                    onClick={() => goToStep(stepOf(p.path))}
                  >
                    {pathLabel(p.path)}
                  </button>
                  : {p.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {blocked && draft.visibility !== 'private' && (
          <Notice tone="error" title="A blocked finding stops sharing">
            <p>
              {draft.visibility === 'public'
                ? 'It cannot be submitted for public review'
                : 'It cannot be shared with friends'}{' '}
              until every blocked item is fixed. You can still save it as
              private, with the findings shown.
            </p>
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                update({ visibility: 'private' })
                goToStep('visibility')
              }}
            >
              Switch to private
            </button>
          </Notice>
        )}

        {saveError && (
          <Notice tone="error" role="alert">
            {saveError}
          </Notice>
        )}
        {saved && (
          <Notice tone="success" role="status">
            <p>{saved}</p>
            <p>
              <Link to="/me" className={textLink}>
                Go to My agents
              </Link>
            </p>
          </Notice>
        )}

        <button
          type="button"
          className={primaryButton}
          onClick={save}
          disabled={
            saving ||
            needsEmailVerification ||
            profile === null ||
            (blocked && draft.visibility !== 'private')
          }
        >
          {saving && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {saveLabel}
        </button>
        {editing && dirty && !saving && (
          <p className="text-xs text-fg-muted">
            You have unsaved changes. They are kept on this device until you
            save.
          </p>
        )}
      </section>
    </div>
  )
}

/** The draft's content without React list keys, for "is anything unsaved" checks. */
function draftText(draft: StudioDraft): string {
  return JSON.stringify(draft, (k, v) => (k === 'key' ? undefined : v))
}

function savedMessage(
  visibility: AgentRecord['visibility'],
  staged: boolean,
  live: AgentRecord | null,
): string {
  if (staged)
    return `Your edit is waiting for review. Version ${live?.version ?? ''} stays live until a reviewer approves the new one, which then appears within about an hour.`
  const wasLive =
    live?.visibility === 'public' && live.review_status === 'approved'
  if (visibility === 'private')
    return wasLive
      ? 'Saved as private. It leaves the public catalog on the next refresh, within about an hour.'
      : 'Saved. Only you can see it.'
  if (visibility === 'friends')
    return wasLive
      ? 'Saved for friends. It leaves the public catalog on the next refresh, within about an hour.'
      : 'Saved. Your friends can see it now.'
  return 'Submitted for review. A person reviews it first; once approved, it appears in the catalog within about an hour.'
}

function EditBanner({
  live,
  pendingEdit,
  draft,
  update,
}: {
  live: AgentRecord | null
  pendingEdit: AgentRecord | null
  draft: StudioDraft
  update: (patch: Partial<StudioDraft>) => void
}) {
  if (!live) return null
  const approvedPublic =
    live.visibility === 'public' && live.review_status === 'approved'
  const suggestion = nextPatch(live.version)
  return (
    <div className="space-y-3">
      {approvedPublic && (
        <Notice title={`Version ${live.version} is live in the public catalog`}>
          <p>
            Your edit goes to review first. The current version stays live
            meanwhile. The new version number must be higher than {live.version}
            .
          </p>
          {!isHigherVersion(draft.version, live.version) && (
            <button
              type="button"
              className={smallButton}
              onClick={() => update({ version: suggestion })}
            >
              Use {suggestion}
            </button>
          )}
        </Notice>
      )}
      {pendingEdit &&
        (pendingEdit.review_status === 'rejected' ? (
          <Notice tone="warn">
            A reviewer did not approve your edit to version{' '}
            {pendingEdit.version}. It is loaded below. Change it and submit
            again, or withdraw it from My agents.
          </Notice>
        ) : (
          <Notice>
            Your edit to version {pendingEdit.version} is waiting for review and
            is loaded below. Saving again replaces it.
          </Notice>
        ))}
      {live.visibility === 'public' && live.review_status === 'pending' && (
        <Notice>
          This agent is waiting for review. Saving keeps it in the queue with
          your changes.
        </Notice>
      )}
      {live.visibility === 'public' && live.review_status === 'rejected' && (
        <Notice tone="warn">
          A reviewer did not approve this agent. Saving it as public sends it
          back for review.
        </Notice>
      )}
    </div>
  )
}
