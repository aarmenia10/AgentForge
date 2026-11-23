import type { ReactNode } from 'react'
import { cn } from '@/components/ui'

/* Small shared pieces for the council builder, in the new flat style. */

export const builderInput = (invalid = false) =>
  cn(
    'w-full rounded-2xl border bg-page px-4 text-sm text-fg placeholder:text-fg-muted focus:border-accent-fg focus:outline-none disabled:opacity-60',
    invalid ? 'border-rose-500 dark:border-rose-400' : 'border-line',
  )

export const pillButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

export const iconPill =
  'inline-grid size-10 place-items-center rounded-full bg-surface-2 text-fg transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0'

/** The problems beside a field, linked to it with aria-describedby. */
export function FieldErrors({
  id,
  messages,
}: {
  id: string
  messages?: string[]
}) {
  if (!messages?.length) return null
  return (
    <div id={id} className="mt-1.5 space-y-0.5">
      {messages.map((message) => (
        <p key={message} className="text-xs text-rose-600 dark:text-rose-300">
          {message}
        </p>
      ))}
    </div>
  )
}

/** A labelled field: label, control, hint, then problems. */
export function BuilderField({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  errors?: string[]
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-fg-muted">
          {hint}
        </p>
      )}
      <FieldErrors id={`${id}-error`} messages={errors} />
    </div>
  )
}

/** aria props that tie a control to its hint and its problems. */
export function describedBy(id: string, hasHint: boolean, hasErrors: boolean) {
  const ids = [hasHint && `${id}-hint`, hasErrors && `${id}-error`].filter(
    Boolean,
  )
  return {
    'aria-invalid': hasErrors || undefined,
    'aria-describedby': ids.length ? ids.join(' ') : undefined,
  } as const
}
