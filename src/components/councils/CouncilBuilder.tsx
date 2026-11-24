import { X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { VerifyEmailNotice } from '@/components/skills/VerifyEmailNotice'
import { ArrowIcon, primaryButtonClass } from '@/components/ui'
import {
  addMember,
  COUNCIL_MAX_MEMBERS,
  COUNCIL_MIN_MEMBERS,
  describeSaveError,
  hasErrors,
  moveMember,
  removeMember,
  setMemberOrder,
  setMemberRole,
  suggestCouncilId,
  toCouncilInput,
  validateDraft,
  type CouncilDraft,
  type FieldErrors,
  type MemberCandidate,
} from '@/lib/councilBuilder'
import { councilStore } from '@/services/councilStore'
import { lockBodyScroll } from '@/lib/scrollLock'
import type { CouncilRecord } from '@/types/council'
import { BuilderMemberList } from './BuilderMemberList'
import { BuilderMemberPicker } from './BuilderMemberPicker'
import {
  BuilderField,
  builderInput,
  describedBy,
  FieldErrors as FieldMessages,
  iconPill,
  pillButton,
} from './builderParts'

const EMPTY: CouncilDraft = {
  id: '',
  name: '',
  description: '',
  tags: '',
  instructions: '',
  members: [],
}

/**
 * The council builder: a dialog over My items. Saves a PRIVATE council through
 * councilStore.create, then hands the saved record back to the list.
 */
export function CouncilBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (record: CouncilRecord | null) => void
}) {
  const { needsEmailVerification } = useAuth()
  const ids = useId()
  const titleId = `${ids}-title`
  const dialogRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<CouncilDraft>(EMPTY)
  // The id follows the name until the person edits it by hand.
  const [idEdited, setIdEdited] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pickNote, setPickNote] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  // Lock page scroll, move focus in, and restore both on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const unlock = lockBodyScroll()
    dialogRef.current?.focus()
    return () => {
      unlock()
      previouslyFocused?.focus()
    }
  }, [])

  // Escape closes from anywhere, even when focus has fallen back to the page.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
      ) ?? [],
    )
    if (!focusable.length) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = document.activeElement
    if (!dialogRef.current?.contains(active)) {
      event.preventDefault()
      first.focus()
    } else if (
      event.shiftKey &&
      (active === first || active === dialogRef.current)
    ) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const patch = (change: Partial<CouncilDraft>) =>
    setDraft((current) => ({ ...current, ...change }))
  const clear = (...fields: string[]) =>
    setErrors((current) => {
      if (!fields.some((field) => current[field])) return current
      const next = { ...current }
      for (const field of fields) delete next[field]
      return next
    })
  // Member rows are numbered by position, so any edit to the list may shift
  // them. Their old messages are dropped and come back on the next save.
  const clearMembers = () =>
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith('members')),
      ),
    )

  function onAdd(candidate: MemberCandidate) {
    const result = addMember(draft.members, candidate)
    if (result.ok) {
      patch({ members: result.members })
      setPickNote(
        `Added ${candidate.name}, pinned to version ${candidate.version}.`,
      )
      clearMembers()
    } else setPickNote(result.error)
  }

  function focusFirstProblem(found: FieldErrors) {
    const order = ['name', 'id', 'description', 'tags', 'instructions']
    const first = order.find((field) => found[field])
    if (first) {
      document.getElementById(`${ids}-${first}`)?.focus()
      return
    }
    const memberField = Object.keys(found).find((key) =>
      /^members\.\d+\./.test(key),
    )
    if (memberField) {
      const [, index, part] = memberField.split('.')
      const member = draft.members[Number(index)]
      if (member)
        document
          .getElementById(
            `${ids}-m-${member.key}-${part === 'order' ? 'order' : 'role'}`,
          )
          ?.focus()
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || needsEmailVerification) return
    setSaveError('')
    const found = validateDraft(draft)
    setErrors(found)
    if (hasErrors(found)) {
      setSaveError(
        'The council is not ready to save. Fix the problems marked below.',
      )
      focusFirstProblem(found)
      return
    }
    setSaving(true)
    try {
      const store = await councilStore()
      const id = await store.create(toCouncilInput(draft))
      const record = await store.get(id).catch(() => null)
      onCreated(record)
      onClose()
    } catch (error) {
      const problem = describeSaveError(error)
      if (problem.field) {
        setErrors({ [problem.field]: [problem.message] })
        document.getElementById(`${ids}-${problem.field}`)?.focus()
      } else setSaveError(problem.message)
      setSaving(false)
    }
  }

  const count = draft.members.length
  const memberErrors = errors.members
  const field = (name: string) => `${ids}-${name}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-page/80 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-[var(--lm-shadow)] focus:outline-none sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
          <div className="min-w-0">
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              Build a Council
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              A private team of your agents and skills, with the order they work
              in. You can share it later.
            </p>
          </div>
          <button
            type="button"
            className={iconPill}
            aria-label="Close"
            onClick={onClose}
            disabled={saving}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <form
          noValidate
          onSubmit={(event) => void save(event)}
          className="min-w-0 flex-1 space-y-8 overflow-y-auto px-5 pb-6 pt-6 sm:px-8"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <BuilderField id={field('name')} label="Name" errors={errors.name}>
              <input
                id={field('name')}
                value={draft.name}
                autoComplete="off"
                onChange={(e) => {
                  const name = e.target.value
                  patch(
                    idEdited ? { name } : { name, id: suggestCouncilId(name) },
                  )
                  clear('name', ...(idEdited ? [] : ['id']))
                }}
                className={builderInput(!!errors.name) + ' h-11'}
                {...describedBy(field('name'), false, !!errors.name)}
              />
            </BuilderField>
            <BuilderField
              id={field('id')}
              label="Unique Name"
              hint="Suggested from the name. Lowercase letters, digits, and hyphens."
              errors={errors.id}
            >
              <input
                id={field('id')}
                value={draft.id}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  setIdEdited(true)
                  patch({ id: e.target.value })
                  clear('id')
                }}
                className={builderInput(!!errors.id) + ' h-11 font-mono'}
                {...describedBy(field('id'), true, !!errors.id)}
              />
            </BuilderField>
          </div>

          <BuilderField
            id={field('description')}
            label="Description"
            errors={errors.description}
          >
            <textarea
              id={field('description')}
              rows={3}
              value={draft.description}
              onChange={(e) => {
                patch({ description: e.target.value })
                clear('description')
              }}
              className={builderInput(!!errors.description) + ' py-3'}
              {...describedBy(
                field('description'),
                false,
                !!errors.description,
              )}
            />
          </BuilderField>

          <BuilderField
            id={field('tags')}
            label="Category and tags"
            hint="Separate with commas or spaces. 1 to 10 tags."
            errors={errors.tags}
          >
            <input
              id={field('tags')}
              value={draft.tags}
              autoComplete="off"
              onChange={(e) => {
                patch({ tags: e.target.value })
                clear('tags')
              }}
              className={builderInput(!!errors.tags) + ' h-11'}
              {...describedBy(field('tags'), true, !!errors.tags)}
            />
          </BuilderField>

          <BuilderField
            id={field('instructions')}
            label="How the Council Works"
            hint="How the members work together: who goes first, what each hands over, and how the results come together."
            errors={errors.instructions}
          >
            <textarea
              id={field('instructions')}
              rows={7}
              value={draft.instructions}
              onChange={(e) => {
                patch({ instructions: e.target.value })
                clear('instructions')
              }}
              className={builderInput(!!errors.instructions) + ' py-3'}
              {...describedBy(
                field('instructions'),
                true,
                !!errors.instructions,
              )}
            />
          </BuilderField>

          <fieldset className="min-w-0 space-y-4">
            <legend className="text-lg font-semibold tracking-tight">
              Members
            </legend>
            <p id={field('members-hint')} className="text-sm text-fg-muted">
              {COUNCIL_MIN_MEMBERS} to {COUNCIL_MAX_MEMBERS} members, each
              pinned to the version you see here. Members with the same stage
              number work at the same time; a higher stage starts after the
              lower ones.
            </p>
            <p className="text-sm font-medium" role="status" aria-live="polite">
              {count} of {COUNCIL_MAX_MEMBERS} members
              {count < COUNCIL_MIN_MEMBERS
                ? ` (add ${COUNCIL_MIN_MEMBERS - count} more at least)`
                : ''}
            </p>
            <FieldMessages
              id={field('members-error')}
              messages={memberErrors}
            />
            <BuilderMemberList
              members={draft.members}
              errors={errors}
              idPrefix={`${ids}-m-`}
              onRole={(key, role) => {
                patch({ members: setMemberRole(draft.members, key, role) })
                clearMembers()
              }}
              onOrder={(key, order) => {
                patch({ members: setMemberOrder(draft.members, key, order) })
                clearMembers()
              }}
              onMove={(key, direction) => {
                patch({ members: moveMember(draft.members, key, direction) })
                clearMembers()
              }}
              onRemove={(key) => {
                patch({ members: removeMember(draft.members, key) })
                setPickNote('Member removed.')
                clearMembers()
                // The pressed button is gone; keep focus inside the dialog.
                dialogRef.current?.focus({ preventScroll: true })
              }}
            />
            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm text-fg-muted"
            >
              {pickNote}
            </p>
            <BuilderMemberPicker
              members={draft.members}
              full={count >= COUNCIL_MAX_MEMBERS}
              onAdd={onAdd}
            />
          </fieldset>

          {needsEmailVerification && <VerifyEmailNotice />}
          {saveError && (
            <p
              role="alert"
              className="whitespace-pre-wrap rounded-3xl bg-surface-2 px-5 py-4 text-sm text-fg"
            >
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className={pillButton}
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={saving || needsEmailVerification}
            >
              {saving ? 'Saving…' : 'Save private council'}
              <ArrowIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
