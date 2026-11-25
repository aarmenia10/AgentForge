import { FolderOpen, Loader2, Upload } from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { cn, copyInstructionClass } from '@/components/ui'
import {
  FindingNote,
  inputClass,
  NO_FINDINGS_TEXT,
  Notice,
  primaryButton,
  secondaryButton,
  SelfContainedNotice,
  smallButton,
  textLink,
} from '@/components/studio/parts'
import { checkSelfContained } from '@/lib/selfContained'
import { Link, useRoute } from '@/router/Router'
import { formatBytes, skillRepository } from '@/lib/skillRepository'
import { SKILL_INSTRUCTIONS_PATH, utf8ByteLength } from '@/lib/skillSchema'
import { describeServiceError } from '@/lib/studioErrors'
import {
  isHigherVersion,
  nextPatch,
  slugify,
  PLACEHOLDER_IDENTITY,
  type Identity,
} from '@/lib/studioManifest'
import { getProfile, type UserProfile } from '@/services/profiles'
import * as skillsApi from '@/services/skills'
import type { SkillFile, SkillRecord } from '@/types/skill'
import { entriesFromDrop, entriesFromFileList } from './filePickers'
import {
  KindLabel,
  SCRIPT_RULE,
  SizeMeter,
  SKILL_VISIBILITY_CHOICES,
  FileText,
} from './parts'
import {
  canSave,
  checkDraft,
  draftFiles,
  effectiveId,
  emptySkillDraft,
  frontmatterOf,
  readUpload,
  saveLabel,
  type DraftCheck,
  type RejectedFile,
  type SkillDraft,
  type UploadEntry,
} from './skillDraft'
import { loadSkillForEdit, saveSkill, ScreenError } from './skillActions'
import { VerifyEmailNotice } from './VerifyEmailNotice'
import { ReplaceMemberDialog } from '@/components/councils/ReplaceMemberDialog'
import { findCouncilUses, replaceCouncilMembers } from '@/services/councilStore'
import type { ItemRef } from '@/types/skill'

/** A message carried across the remount that follows a first save. */
let flash: string | null = null

type Load =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }

interface UploadNote {
  rejected: RejectedFile[]
  skipped: string[]
  refused: string | null
}

export function SkillUpload({ editId }: { editId: string | null }) {
  const { user, needsEmailVerification } = useAuth()
  const { go } = useRoute()
  const editing = editId !== null
  const ids = useId()

  const [load, setLoad] = useState<Load>(() =>
    editing ? { state: 'loading' } : { state: 'ready' },
  )
  const [live, setLive] = useState<SkillRecord | null>(null)
  const [pendingEdit, setPendingEdit] = useState<SkillRecord | null>(null)
  const [draft, setDraft] = useState<SkillDraft>(() => ({
    ...emptySkillDraft(),
    source: 'text',
    text: '',
  }))
  const [guided, setGuided] = useState(!editing)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [profile, setProfile] = useState<UserProfile | null | undefined>(
    undefined,
  )
  const [profileError, setProfileError] = useState('')
  const [takenIds, setTakenIds] = useState<Set<string> | null>(null)
  const [reading, setReading] = useState(false)
  const [uploadNote, setUploadNote] = useState<UploadNote | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState<string | null>(() => {
    const message = flash
    flash = null
    return message
  })
  const [councilVersionUses, setCouncilVersionUses] = useState<Awaited<
    ReturnType<typeof findCouncilUses>
  > | null>(null)
  const [councilVersionTarget, setCouncilVersionTarget] =
    useState<ItemRef | null>(null)
  const [councilVersionReplacement, setCouncilVersionReplacement] =
    useState<ItemRef | null>(null)

  /* ----- loading ----- */

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
    // The public skills file is static, so this costs no database reads.
    let active = true
    skillRepository
      .listSkills()
      .then((r) => active && setTakenIds(new Set(r.skills.map((s) => s.id))))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [editing])

  useEffect(() => {
    if (!editId || !user) return
    let active = true
    void loadSkillForEdit(skillsApi, editId, user.uid).then((result) => {
      if (!active) return
      if (!result.ok) {
        setLoad({ state: 'error', message: result.message })
        return
      }
      setLive(result.live)
      setPendingEdit(result.pendingEdit)
      setDraft(result.draft)
      setLoad({ state: 'ready' })
    })
    return () => {
      active = false
    }
  }, [editId, user])

  /* ----- live checks ----- */

  const identity: Identity = profile
    ? { uid: profile.uid, name: profile.display_name, handle: profile.handle }
    : PLACEHOLDER_IDENTITY
  const checked = useDeferredValue(draft)
  const check = useMemo(
    () => checkDraft(checked, identity, { takenIds, live }),
    // identity is derived from profile, so profile stands in for it here.
    [checked, profile, takenIds, live],
  )
  const stale = checked !== draft
  const selfContained = useMemo(
    () => checkSelfContained({ files: draftFiles(checked) }, 'skill'),
    [checked],
  )

  function update(patch: Partial<SkillDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setSaved(null)
    setSaveError('')
  }

  function writeInstructions(
    nextName: string,
    nextDescription: string,
    body: string,
  ) {
    setName(nextName)
    setDescription(nextDescription)
    setInstructions(body)
    update({
      source: 'text',
      text: [
        '---',
        'name: ' + JSON.stringify(slugify(nextName).slice(0, 64)),
        'description: ' + JSON.stringify(nextDescription),
        '---',
        '',
        body,
      ].join('\n'),
    })
  }

  async function takeUpload(entries: UploadEntry[]) {
    if (entries.length === 0) return
    setReading(true)
    try {
      const result = await readUpload(entries)
      setUploadNote({
        rejected: result.rejected,
        skipped: result.skipped,
        refused: result.refused,
      })
      if (!result.refused) {
        setGuided(false)
        update({ source: 'files', files: result.files })
      }
    } finally {
      setReading(false)
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const items = event.dataTransfer.items
    if (items && items.length) void entriesFromDrop(items).then(takeUpload)
    else void takeUpload(entriesFromFileList(event.dataTransfer.files))
  }

  function removeFile(path: string) {
    update({ files: draft.files.filter((f) => f.path !== path) })
  }

  /* ----- saving ----- */

  async function save() {
    setShowAll(true)
    setSaveError('')
    setSaved(null)
    if (stale) {
      setSaveError('Still checking your changes. Press the button again.')
      return
    }
    if (guided && draft.source === 'text' && !instructions.trim()) {
      setSaveError('Add the instructions your AI should follow.')
      return
    }
    if (!canSave(check) || needsEmailVerification || !profile) return
    setSaving(true)
    try {
      const result = await saveSkill(skillsApi, check.manifest, live)
      if (result.kind === 'created') {
        flash = result.message
        go(`/skills/new?edit=${encodeURIComponent(result.id)}`, {
          replace: true,
        })
        return
      }
      if (result.live) setLive(result.live)
      setPendingEdit(result.pendingEdit)
      setSaved(result.message)
      if (
        live?.visibility === 'private' &&
        check.manifest.visibility === 'private' &&
        check.manifest.version !== live.version
      ) {
        const oldRef: ItemRef = {
          kind: 'skill',
          id: check.manifest.id,
          version: live.version,
        }
        try {
          const uses = await findCouncilUses(oldRef, live.version)
          if (uses.owner.length || uses.public.length) {
            setCouncilVersionUses(uses)
            setCouncilVersionTarget(oldRef)
            setCouncilVersionReplacement({
              kind: 'skill',
              id: check.manifest.id,
              version: check.manifest.version,
            })
          }
        } catch (error) {
          setSaveError(
            `Skill saved, but its councils could not be checked: ${describeServiceError(error, 'load', 'skill')}`,
          )
        }
      }
    } catch (error) {
      setSaveError(
        error instanceof ScreenError
          ? error.message
          : describeServiceError(error, 'save', 'skill'),
      )
    } finally {
      setSaving(false)
    }
  }

  /* ----- rendering ----- */

  if (load.state === 'loading')
    return (
      <p className="mt-4 inline-flex items-center gap-2" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading the skill…
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
            Go to My items
          </Link>{' '}
          or{' '}
          <Link to="/skills/new" className={textLink}>
            upload a new skill
          </Link>
          .
        </p>
      </div>
    )

  const files = draftFiles(draft)
  const front = frontmatterOf(files)
  const fieldProblems = (field: string) =>
    check.problems.filter((p) => p.field === field)
  const shownProblems = (field: string) =>
    fieldProblems(field).filter(
      () =>
        showAll || field === 'files' || field === 'id' || field === 'version',
    )
  const blockCount = check.findings.filter((f) => f.severity === 'block').length
  const warnCount = check.findings.length - blockCount
  const sharing = draft.visibility !== 'private'

  return (
    <div className="mt-4 space-y-6 text-sm">
      <EditBanner
        live={live}
        pendingEdit={pendingEdit}
        version={draft.version}
        onUseVersion={(version) => update({ version })}
      />

      {guided && (
        <Section id={`${ids}-about`} title="1. Tell Us About Your Skill">
          <TextField
            id={`${ids}-name`}
            label="Skill name"
            value={name}
            onChange={(value) =>
              writeInstructions(value, description, instructions)
            }
            hint="For example, Invoice Checker."
            problems={shownProblems('name').map((p) => p.message)}
          />
          <TextField
            id={`${ids}-description`}
            label="Description"
            value={description}
            onChange={(value) => writeInstructions(name, value, instructions)}
            hint="What does your skill help people do?"
            problems={shownProblems('description').map((p) => p.message)}
          />
        </Section>
      )}
      <Section id={`${ids}-files`} title="2. Add Your Skill Instructions">
        <p className={copyInstructionClass}>
          Write or paste the instructions you want your AI to follow, or upload
          an existing skill. Limits: 200 KB total, 100 KB per file, 50 text
          files. Scripts are allowed only in private skills.
        </p>
        <div
          role="group"
          aria-label="How to add your skill"
          className="flex w-full rounded-full bg-surface-2 p-1 sm:w-fit"
        >
          {(
            [
              ['files', 'Upload files'],
              ['text', 'Write Instructions'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={draft.source === value}
              onClick={() => update({ source: value })}
              className={cn(
                'flex-1 rounded-full px-4 py-2 text-sm font-medium transition sm:flex-none',
                draft.source === value
                  ? 'bg-surface text-fg'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {draft.source === 'files' ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'space-y-3 rounded-3xl bg-surface p-5 text-center transition sm:p-6',
                dragging ? 'ring-2 ring-accent-fg' : '',
              )}
            >
              <Upload
                className="mx-auto size-6 text-fg-muted"
                aria-hidden="true"
              />
              <p className="font-medium text-fg">Drop your skill folder here</p>
              <div className="flex flex-wrap justify-center gap-2">
                <PickerButton
                  id={`${ids}-folder`}
                  folder
                  onPick={(list) => takeUpload(entriesFromFileList(list))}
                >
                  <FolderOpen className="size-4" aria-hidden="true" />
                  Choose folder
                </PickerButton>
                <PickerButton
                  id={`${ids}-many`}
                  onPick={(list) => takeUpload(entriesFromFileList(list))}
                >
                  Choose files
                </PickerButton>
              </div>
              <p className="text-xs text-fg-muted">
                Choose files puts every file at the top of the skill, because
                the browser does not send folders that way. Links from SKILL.md
                into subfolders will not work, so use a computer and Choose
                folder for skills with folders. Choosing again replaces the
                files below. A .zip or .skill file is not accepted: unzip it and
                choose the folder instead.
              </p>
            </div>
            {reading && (
              <p className="inline-flex items-center gap-2" role="status">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Reading the files…
              </p>
            )}
            {uploadNote && <UploadReport note={uploadNote} />}
            {draft.files.length > 0 && (
              <FileList
                files={draft.files}
                check={check}
                onRemove={removeFile}
              />
            )}
          </>
        ) : guided ? (
          <div>
            <label
              htmlFor={`${ids}-plain`}
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Skill Instructions
            </label>
            <textarea
              id={`${ids}-plain`}
              value={instructions}
              onChange={(e) =>
                writeInstructions(name, description, e.target.value)
              }
              rows={14}
              className={cn(inputClass(), 'py-2')}
            />
            <details className="mt-3">
              <summary>Advanced Options</summary>
              <button
                type="button"
                className={smallButton}
                onClick={() => setGuided(false)}
              >
                Edit the original instructions file
              </button>
            </details>
            <FileNotesView check={check} path={SKILL_INSTRUCTIONS_PATH} />
          </div>
        ) : (
          <div>
            <label
              htmlFor={`${ids}-text`}
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Skill Instructions
            </label>
            <textarea
              id={`${ids}-text`}
              value={draft.text}
              onChange={(e) => update({ text: e.target.value })}
              rows={14}
              spellCheck={false}
              className={cn(
                inputClass(),
                'py-2 font-mono text-xs leading-relaxed',
              )}
            />
            <p className="mt-1.5 text-xs text-fg-muted">
              Keep the lines between the two <code>---</code> marks: the name
              (lowercase words joined by hyphens) and a description saying what
              the skill does and when to use it. Write the instructions below
              them.
            </p>
            <FileNotesView check={check} path={SKILL_INSTRUCTIONS_PATH} />
          </div>
        )}

        <SizeMeter
          bytes={check.totalBytes}
          files={files.length}
          idBase={`${ids}-meter`}
        />
        <ProblemLines problems={shownProblems('files').map((p) => p.message)} />
      </Section>

      <Section id={`${ids}-details`} title="Skill Information">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[7rem_1fr]">
          <dt className="font-medium text-fg">Name</dt>
          <dd className="min-w-0">
            {front ? (
              <code className="break-all font-mono">{front.name}</code>
            ) : (
              <span className="text-fg-muted">
                Read from your skill instructions once added.
              </span>
            )}
            <ProblemLines
              problems={shownProblems('name').map((p) => p.message)}
            />
          </dd>
          <dt className="font-medium text-fg">Description</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">
            {front?.description ?? (
              <span className="text-fg-muted">
                Read from your skill instructions once added.
              </span>
            )}
            <ProblemLines
              problems={shownProblems('description').map((p) => p.message)}
            />
            <OtherFindings check={check} field="description" />
          </dd>
        </dl>
        <OtherFindings check={check} field="name" />

        <TextField
          id={`${ids}-id`}
          label="Unique Name"
          value={editing ? draft.id : effectiveId(draft)}
          disabled={editing}
          onChange={(id) => update({ id, idTouched: true })}
          hint={
            editing
              ? 'The id cannot change after the first save.'
              : 'Part of the skill’s address. It starts as the name in your skill instructions.'
          }
          problems={shownProblems('id').map((p) => p.message)}
        />
        <TextField
          id={`${ids}-version`}
          label="Version"
          value={draft.version}
          onChange={(version) => update({ version })}
          hint="Like 1.0.0. Raise it when you change a skill people already use."
          problems={shownProblems('version').map((p) => p.message)}
        />
        <TextField
          id={`${ids}-tags`}
          label="Category and tags"
          value={draft.tags}
          onChange={(tags) => update({ tags })}
          hint="1 to 10, separated by commas, such as pdf, forms, finance."
          problems={shownProblems('tags').map((p) => p.message)}
        >
          <OtherFindings check={check} field="tags" />
        </TextField>
      </Section>

      <Section id={`${ids}-who`} title="3. Who Can Access This">
        <fieldset>
          <legend className="mb-3 block text-sm font-medium text-fg">
            Who can see this skill?
          </legend>
          <div className="space-y-2">
            {SKILL_VISIBILITY_CHOICES.map(
              ({ value, label, line, icon: Icon }) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-3 rounded-3xl border border-line bg-surface p-4 has-[:checked]:border-accent-fg has-[:checked]:bg-accent/10"
                >
                  <input
                    type="radio"
                    name={`${ids}-visibility`}
                    value={value}
                    checked={draft.visibility === value}
                    onChange={() => update({ visibility: value })}
                    className="mt-1 size-4 accent-[var(--lm-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </span>
                    <span className="block text-sm">{line}</span>
                  </span>
                </label>
              ),
            )}
          </div>
        </fieldset>
        <p className="text-fg">{SCRIPT_RULE}</p>
        {check.scripts.length > 0 && sharing && (
          <Notice tone="error" title="This skill has scripts">
            <p>
              {draft.visibility === 'public'
                ? 'It cannot be submitted for public review'
                : 'It cannot be shared with friends'}{' '}
              while it has{' '}
              {check.scripts.length === 1 ? 'this script' : 'these scripts'}:
            </p>
            <ul className="space-y-1">
              {check.scripts.map((path) => (
                <li
                  key={path}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <code className="break-all font-mono text-xs">{path}</code>
                  {draft.source === 'files' && (
                    <button
                      type="button"
                      className={smallButton}
                      onClick={() => removeFile(path)}
                    >
                      Remove<span className="sr-only"> {path}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={smallButton}
              onClick={() => update({ visibility: 'private' })}
            >
              Keep it private instead
            </button>
          </Notice>
        )}
        {live?.visibility === 'public' &&
          live.review_status === 'approved' &&
          draft.visibility !== 'public' && (
            <Notice tone="warn">
              This skill is on the public skills page now. Saving it as{' '}
              {draft.visibility === 'private' ? 'private' : 'friends only'}{' '}
              takes it off on the next refresh, within about an hour.
            </Notice>
          )}
      </Section>

      <Section id={`${ids}-save`} title="4. Publish Skill">
        <p className="text-xs text-fg-muted">
          {check.findings.length === 0
            ? NO_FINDINGS_TEXT
            : `The safety linter flagged ${blockCount ? `${blockCount} item${blockCount > 1 ? 's' : ''} that block${blockCount > 1 ? '' : 's'} sharing` : ''}${blockCount && warnCount ? ' and ' : ''}${warnCount ? `${warnCount} item${warnCount > 1 ? 's' : ''} for a reviewer to check` : ''}. Each one is shown beside its file.`}
        </p>
        <SelfContainedNotice warnings={selfContained} />
        {needsEmailVerification && <VerifyEmailNotice />}
        {profile === null && (
          <Notice tone="warn" title="Choose your username first">
            <p>
              {profileError ||
                'Skills are published under your username, and you have not picked one yet.'}{' '}
              <Link to="/settings" className={textLink}>
                Choose your username in Settings
              </Link>
              .
            </p>
          </Notice>
        )}
        {showAll && check.problemCount > 0 && (
          <Notice
            tone="error"
            title={`Fix ${check.problemCount} thing${check.problemCount > 1 ? 's' : ''} before saving`}
          >
            <ul className="list-disc space-y-1 pl-5">
              {check.problems.map((p, i) => (
                <li key={`p${i}`}>{p.message}</li>
              ))}
              {[...check.byFile].flatMap(([path, notes]) =>
                notes.problems.map((message, i) => (
                  <li key={`${path}${i}`}>
                    <code className="break-all font-mono text-xs">{path}</code>:{' '}
                    {message}
                  </li>
                )),
              )}
            </ul>
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
                Go to My items
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
            reading ||
            needsEmailVerification ||
            profile === null ||
            (check.blocked && sharing)
          }
        >
          {saving && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {saveLabel(draft.visibility, live)}
        </button>
      </Section>
      {councilVersionUses &&
        councilVersionTarget &&
        councilVersionReplacement && (
          <ReplaceMemberDialog
            mode="version"
            itemName={name || check.manifest.name}
            target={councilVersionTarget}
            replacement={councilVersionReplacement}
            ownerUses={councilVersionUses.owner}
            publicUses={councilVersionUses.public}
            onCancel={() => {
              setCouncilVersionUses(null)
              setCouncilVersionTarget(null)
              setCouncilVersionReplacement(null)
            }}
            onUpdateVersion={async () => {
              const result = await replaceCouncilMembers(
                councilVersionUses.owner,
                councilVersionTarget,
                councilVersionReplacement,
                councilVersionTarget.version,
              )
              setCouncilVersionUses(null)
              setCouncilVersionTarget(null)
              setCouncilVersionReplacement(null)
              setSaved(
                result.staged.length
                  ? `Updates to ${result.staged.join(', ')} were sent for review.`
                  : 'Updated your councils to the new skill version.',
              )
            }}
          />
        )}
    </div>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-4 rounded-3xl bg-surface p-5 sm:p-6"
    >
      <h2 id={id} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  )
}

function PickerButton({
  id,
  folder = false,
  onPick,
  children,
}: {
  id: string
  folder?: boolean
  onPick: (list: FileList | null) => void
  children: ReactNode
}) {
  return (
    <>
      <input
        id={id}
        type="file"
        multiple
        className="peer sr-only"
        // React has no prop for the folder picker attribute.
        ref={(el) => {
          if (el && folder) el.setAttribute('webkitdirectory', '')
        }}
        onChange={(e) => {
          onPick(e.target.files)
          // Lets the same folder be chosen again after a change on disk.
          e.target.value = ''
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          secondaryButton,
          'cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg',
        )}
      >
        {children}
      </label>
    </>
  )
}

function UploadReport({ note }: { note: UploadNote }) {
  if (!note.refused && !note.rejected.length && !note.skipped.length)
    return null
  return (
    <div className="space-y-2" aria-live="polite">
      {note.refused && (
        <Notice tone="error" role="alert">
          {note.refused}
        </Notice>
      )}
      {note.rejected.length > 0 && (
        <Notice tone="warn" title="Not added">
          <ul className="space-y-1">
            {note.rejected.map((r) => (
              <li key={r.path}>
                <code className="break-all font-mono text-xs">{r.path}</code>:{' '}
                {r.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {note.skipped.length > 0 && (
        <p className="text-xs text-fg-muted">
          Left out on purpose (hidden files and tool folders):{' '}
          {note.skipped.slice(0, 8).join(', ')}
          {note.skipped.length > 8
            ? `, and ${note.skipped.length - 8} more`
            : ''}
          .
        </p>
      )}
    </div>
  )
}

function FileList({
  files,
  check,
  onRemove,
}: {
  files: SkillFile[]
  check: DraftCheck
  onRemove: (path: string) => void
}) {
  return (
    <ul className="space-y-2" aria-label="Files in this skill">
      {files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          check={check}
          onRemove={() => onRemove(file.path)}
        />
      ))}
    </ul>
  )
}

function FileRow({
  file,
  check,
  onRemove,
}: {
  file: SkillFile
  check: DraftCheck
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const panel = useId()
  return (
    <li className="rounded-3xl bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <code className="min-w-0 break-all font-mono text-xs font-semibold text-fg">
          {file.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <KindLabel kind={file.kind} />
          <span className="font-mono text-xs tabular-nums text-fg-muted">
            {formatBytes(utf8ByteLength(file.content))}
          </span>
        </span>
      </div>
      <FileNotesView check={check} path={file.path} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          className={smallButton}
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide the text' : 'Show the text'}
          <span className="sr-only"> of {file.path}</span>
        </button>
        <button type="button" className={smallButton} onClick={onRemove}>
          Remove<span className="sr-only"> {file.path}</span>
        </button>
      </div>
      {open && (
        <div id={panel} className="mt-2">
          <FileText text={file.content} label={`Text of ${file.path}`} />
        </div>
      )}
    </li>
  )
}

/** Validation problems, then Blocked and Check findings, for one file. */
export function FileNotesView({
  check,
  path,
}: {
  check: DraftCheck
  path: string
}) {
  const notes = check.byFile.get(path)
  if (!notes || (!notes.problems.length && !notes.findings.length)) return null
  return (
    <div className="mt-2 space-y-1.5">
      <ProblemLines problems={notes.problems} />
      {notes.findings.map((f, i) => (
        <FindingNote key={`${f.rule}${i}`} finding={f} />
      ))}
    </div>
  )
}

function OtherFindings({ check, field }: { check: DraftCheck; field: string }) {
  const found = check.otherFindings.filter(
    (f) =>
      f.path === field ||
      f.path.startsWith(`${field}[`) ||
      f.path.startsWith(`${field}.`),
  )
  if (!found.length) return null
  return (
    <div className="mt-2 space-y-1.5">
      {found.map((f, i) => (
        <FindingNote key={`${f.rule}${i}`} finding={f} />
      ))}
    </div>
  )
}

function ProblemLines({ problems }: { problems: string[] }) {
  if (!problems.length) return null
  return (
    <div className="mt-1.5 space-y-1">
      {problems.map((message, i) => (
        <p key={i} className="text-xs text-fg">
          {message}
        </p>
      ))}
    </div>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  problems,
  disabled,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint: string
  problems: string[]
  disabled?: boolean
  children?: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problems.length > 0 || undefined}
        className={cn(inputClass(problems.length > 0), 'h-10')}
        autoComplete="off"
        spellCheck={false}
      />
      <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>
      <ProblemLines problems={problems} />
      {children}
    </div>
  )
}

function EditBanner({
  live,
  pendingEdit,
  version,
  onUseVersion,
}: {
  live: SkillRecord | null
  pendingEdit: SkillRecord | null
  version: string
  onUseVersion: (version: string) => void
}) {
  if (!live) return null
  const approvedPublic =
    live.visibility === 'public' && live.review_status === 'approved'
  const suggestion = nextPatch(live.version)
  return (
    <div className="space-y-3">
      {approvedPublic && (
        <Notice
          title={`Version ${live.version} is live on the public skills page`}
        >
          <p>
            Your edit goes to review first. The current version stays live
            meanwhile. The new version number must be higher than {live.version}
            .
          </p>
          {!isHigherVersion(version, live.version) && (
            <button
              type="button"
              className={smallButton}
              onClick={() => onUseVersion(suggestion)}
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
            again, or withdraw it from My items.
          </Notice>
        ) : (
          <Notice>
            Your edit to version {pendingEdit.version} is waiting for review and
            is loaded below. Saving again replaces it.
          </Notice>
        ))}
      {live.visibility === 'public' && live.review_status === 'pending' && (
        <Notice>
          This skill is waiting for review. Saving keeps it in the queue with
          your changes.
        </Notice>
      )}
      {live.visibility === 'public' && live.review_status === 'rejected' && (
        <Notice tone="warn">
          A reviewer did not approve this skill. Saving it as public sends it
          back for review.
        </Notice>
      )}
    </div>
  )
}
