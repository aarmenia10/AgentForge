import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  cleanOrder,
  type DraftMember,
  type FieldErrors,
} from '@/lib/councilBuilder'
import {
  builderInput,
  describedBy,
  FieldErrors as FieldMessages,
  iconPill,
} from './builderParts'

/**
 * The stage number is committed on blur or Enter, not on every key, so the
 * card does not jump to a new place in the list while the person is typing.
 */
function StageInput({
  id,
  value,
  invalid,
  describedProps,
  onCommit,
}: {
  id: string
  value: number
  invalid: boolean
  describedProps: ReturnType<typeof describedBy>
  onCommit: (order: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const next = cleanOrder(Number(text))
    setText(String(next))
    if (next !== value) onCommit(next)
  }
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={1}
      step={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      className={builderInput(invalid) + ' h-11'}
      {...describedProps}
    />
  )
}

/** The chosen members, in running order, with role, stage, move, and remove. */
export function BuilderMemberList({
  members,
  errors,
  idPrefix,
  onRole,
  onOrder,
  onMove,
  onRemove,
}: {
  members: readonly DraftMember[]
  errors: FieldErrors
  /** Ids of the role and stage inputs are `<idPrefix><key>-role` and `-order`. */
  idPrefix: string
  onRole: (key: number, role: string) => void
  onOrder: (key: number, order: number) => void
  onMove: (key: number, direction: -1 | 1) => void
  onRemove: (key: number) => void
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const [refocus, setRefocus] = useState<{ key: number; dir: -1 | 1 } | null>(
    null,
  )
  // A moved card is re-inserted by the browser, which drops focus. Put it
  // back on the same arrow, or on the other one at the end of the list.
  useEffect(() => {
    if (!refocus) return
    const root = listRef.current
    const pick = (dir: number) =>
      root?.querySelector<HTMLButtonElement>(
        `[data-move="${refocus.key}:${dir}"]:not(:disabled)`,
      )
    ;(pick(refocus.dir) ?? pick(-refocus.dir))?.focus()
    setRefocus(null)
  }, [refocus, members])

  if (!members.length)
    return (
      <p className="rounded-2xl bg-page px-4 py-3 text-sm text-fg-muted">
        No members yet. Add at least 2 from the lists below.
      </p>
    )

  return (
    <ol ref={listRef} className="space-y-3">
      {members.map((member, index) => {
        const base = `${idPrefix}${member.key}`
        const roleErrors = errors[`members.${index}.role`]
        const orderErrors = errors[`members.${index}.order`]
        const refErrors = errors[`members.${index}.ref`]
        return (
          <li key={member.key} className="space-y-3 rounded-2xl bg-page p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{member.name}</p>
                <p className="break-all font-mono text-xs text-fg-muted">
                  {member.ref.kind} · {member.ref.id}@{member.ref.version}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  className={iconPill}
                  data-move={`${member.key}:-1`}
                  disabled={index === 0}
                  aria-label={`Move ${member.name} up`}
                  onClick={() => {
                    onMove(member.key, -1)
                    setRefocus({ key: member.key, dir: -1 })
                  }}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconPill}
                  data-move={`${member.key}:1`}
                  disabled={index === members.length - 1}
                  aria-label={`Move ${member.name} down`}
                  onClick={() => {
                    onMove(member.key, 1)
                    setRefocus({ key: member.key, dir: 1 })
                  }}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconPill}
                  aria-label={`Remove ${member.name}`}
                  onClick={() => onRemove(member.key)}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <div className="min-w-0">
                <label
                  htmlFor={`${base}-role`}
                  className="mb-1.5 block text-sm font-medium"
                >
                  Role
                </label>
                <input
                  id={`${base}-role`}
                  value={member.role}
                  maxLength={400}
                  placeholder="For example, Security Auditor"
                  onChange={(e) => onRole(member.key, e.target.value)}
                  className={builderInput(!!roleErrors) + ' h-11'}
                  {...describedBy(`${base}-role`, false, !!roleErrors)}
                />
                <FieldMessages
                  id={`${base}-role-error`}
                  messages={roleErrors}
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`${base}-order`}
                  className="mb-1.5 block text-sm font-medium"
                >
                  Stage
                </label>
                <StageInput
                  id={`${base}-order`}
                  value={member.order}
                  invalid={!!orderErrors}
                  describedProps={describedBy(
                    `${base}-order`,
                    false,
                    !!orderErrors,
                  )}
                  onCommit={(order) => onOrder(member.key, order)}
                />
                <FieldMessages
                  id={`${base}-order-error`}
                  messages={orderErrors}
                />
              </div>
            </div>
            <FieldMessages id={`${base}-ref-error`} messages={refErrors} />
          </li>
        )
      })}
    </ol>
  )
}
