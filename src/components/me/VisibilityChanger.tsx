import { useId, useState } from 'react'
import { primaryButton, secondaryButton } from '@/components/studio/parts'
import { VISIBILITY_CHOICES } from '@/components/studio/StepVisibility'
import type { AgentRecord } from '@/types/agent'

/** Pick a new visibility, read what it does, then confirm. */
export function VisibilityChanger({
  record,
  edit,
  blocked,
  initial,
  busy,
  onCancel,
  onConfirm,
}: {
  record: AgentRecord
  edit: AgentRecord | null
  blocked: boolean
  initial: AgentRecord['visibility'] | null
  busy: boolean
  onCancel: () => void
  onConfirm: (visibility: AgentRecord['visibility']) => void
}) {
  const [choice, setChoice] = useState<AgentRecord['visibility'] | null>(
    initial,
  )
  const name = useId()
  const options = VISIBILITY_CHOICES.filter(
    (c) => c.value !== record.visibility,
  )
  const liveApproved =
    record.visibility === 'public' && record.review_status === 'approved'
  const shareBlocked = blocked && choice !== null && choice !== 'private'

  const consequences: string[] = []
  if (choice) {
    if (liveApproved)
      consequences.push(
        'It leaves the public catalog on the next refresh, within about an hour.',
      )
    else if (record.visibility === 'public')
      consequences.push('It leaves the review queue.')
    if (choice === 'public')
      consequences.push(
        'It goes to the review queue. A person reviews it first, then it appears within about an hour.',
      )
    if (choice === 'friends')
      consequences.push('Your accepted friends can see it right away.')
    if (choice === 'private') consequences.push('Only you can see it.')
    if (edit)
      consequences.push(
        `Your waiting edit to version ${edit.version} is withdrawn.`,
      )
  }

  return (
    <fieldset className="mt-3 space-y-3 rounded-xl border border-slate-300 p-3 dark:border-white/15">
      <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-white">
        Change who can see {record.name}
      </legend>
      <div className="space-y-2">
        {options.map(({ value, label, line }) => (
          <label key={value} className="flex cursor-pointer gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={choice === value}
              onChange={() => setChoice(value)}
              className="mt-1 size-4 accent-teal-700 dark:accent-teal-400"
            />
            <span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {label}.
              </span>{' '}
              {line}
            </span>
          </label>
        ))}
      </div>
      {consequences.length > 0 && !shareBlocked && (
        <ul className="list-disc space-y-1 pl-5 text-sm" aria-live="polite">
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {shareBlocked && (
        <p
          className="text-sm text-rose-700 dark:text-rose-300"
          aria-live="polite"
        >
          This agent has a blocked finding from the safety linter. Fix it in the
          Studio before sharing it. Private is still allowed.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={!choice || busy || shareBlocked}
          onClick={() => choice && onConfirm(choice)}
        >
          {choice === 'private'
            ? 'Make it private'
            : choice === 'friends'
              ? 'Share with friends'
              : choice === 'public'
                ? 'Submit for public review'
                : 'Confirm'}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </fieldset>
  )
}
