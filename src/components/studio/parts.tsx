import {
  Globe,
  Info,
  Lock,
  OctagonAlert,
  TriangleAlert,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui'
import type { LintFinding } from '@/lib/safetyLinter'
import type { Problem } from '@/lib/studioManifest'
import type { AgentManifest, AgentRecord } from '@/types/agent'
import type { SelfContainedWarning } from '@/lib/selfContained'

/* Shared pieces for the Studio, My agents, and the review queue. */

export const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_var(--lm-accent)] disabled:cursor-not-allowed disabled:opacity-50'

export const secondaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface px-5 text-sm font-medium text-fg transition duration-200 hover:-translate-y-0.5 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

export const dangerButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-surface-2 px-5 text-sm font-semibold text-fg transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--lm-shadow)] disabled:cursor-not-allowed disabled:opacity-50'

export const smallButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface-2 px-4 text-xs font-medium text-fg transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

export const textLink =
  'font-medium text-accent-fg underline-offset-2 hover:underline'

export function inputClass(invalid = false) {
  return cn(
    'w-full rounded-2xl border bg-surface px-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent-fg disabled:opacity-60',
    invalid ? 'border-accent-fg' : 'border-line',
  )
}

/**
 * Small typographic label for a status or visibility. Never a pill
 * (README 7.1): colored monospace capitals, no background.
 */
export function StatusText({
  tone = 'slate',
  icon,
  children,
}: {
  tone?: 'slate' | 'teal' | 'amber' | 'rose' | 'indigo'
  icon?: ReactNode
  children: ReactNode
}) {
  const color = {
    slate: 'text-fg-muted',
    teal: 'text-accent-fg',
    amber: 'text-fg',
    rose: 'text-fg',
    indigo: 'text-fg-muted',
  }[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]',
        color,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export const VISIBILITY_TEXT: Record<AgentManifest['visibility'], string> = {
  private: 'Private',
  friends: 'Friends',
  public: 'Public',
}

export function VisibilityLabel({
  visibility,
}: {
  visibility: AgentManifest['visibility']
}) {
  const Icon =
    visibility === 'public' ? Globe : visibility === 'friends' ? Users : Lock
  return (
    <StatusText icon={<Icon className="size-3" aria-hidden="true" />}>
      {VISIBILITY_TEXT[visibility]}
    </StatusText>
  )
}

/** Review status only means something for public agents. */
export function ReviewLabel({ record }: { record: AgentRecord }) {
  if (record.visibility !== 'public')
    return <StatusText>No review needed</StatusText>
  if (record.review_status === 'approved')
    return <StatusText tone="teal">Approved</StatusText>
  if (record.review_status === 'rejected')
    return <StatusText tone="rose">Not approved</StatusText>
  return <StatusText tone="amber">Waiting for review</StatusText>
}

/** A labelled form field with its hint and its problems underneath. */
export function Field({
  id,
  label,
  hint,
  notes,
  children,
}: {
  id: string
  label: string
  hint?: ReactNode
  notes?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
      {notes}
    </div>
  )
}

const SEVERITY_TEXT: Record<LintFinding['severity'], string> = {
  block: 'Blocks sharing',
  warn: 'A reviewer will check this',
}

/** One linter finding, in plain English. */
export function FindingNote({
  finding,
  showPath,
}: {
  finding: LintFinding
  /** Prefix the field name, for lists that are not beside the field. */
  showPath?: string
}) {
  const block = finding.severity === 'block'
  const Icon = block ? OctagonAlert : TriangleAlert
  return (
    <div
      className={cn(
        'flex gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs text-fg',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p>
          <span className="font-semibold">
            {block ? 'Blocked' : 'Check'} ({finding.rule}
            {showPath ? `, ${showPath}` : ''}):
          </span>{' '}
          {finding.message}
        </p>
        {finding.excerpt && (
          <div className="space-y-1">
            <p className="font-medium">Context from your submission</p>
            <p className="break-words font-mono opacity-90">
              “{finding.excerpt}”
            </p>
            <p className="opacity-90">This is only a preview.</p>
          </div>
        )}
        <p className="opacity-90">{SEVERITY_TEXT[finding.severity]}.</p>
        {block && (
          <p>
            Correct any unsafe behavior before sharing. Contact support if you
            believe this finding is incorrect.
          </p>
        )}
      </div>
    </div>
  )
}

export function ProblemNote({ problem }: { problem: Problem }) {
  return <p className="text-xs text-fg">{problem.message}</p>
}

/** The notes under a field: its validation problems, then its findings. */
export function Notes({
  problems = [],
  findings = [],
}: {
  problems?: Problem[]
  findings?: LintFinding[]
}) {
  if (!problems.length && !findings.length) return null
  return (
    <div className="mt-2 space-y-1.5">
      {problems.map((p, i) => (
        <ProblemNote key={`p${i}`} problem={p} />
      ))}
      {findings.map((f, i) => (
        <FindingNote key={`f${i}${f.rule}`} finding={f} />
      ))}
    </div>
  )
}

/** A bordered message box. */
export function Notice({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success'
  title?: ReactNode
  children?: ReactNode
  role?: 'status' | 'alert'
}) {
  const styles = {
    info: 'border-line bg-surface-2 text-fg',
    warn: 'border-line bg-surface-2 text-fg',
    error: 'border-line bg-surface-2 text-fg',
    success: 'border-line bg-surface-2 text-fg',
  }[tone]
  const Icon =
    tone === 'error' ? OctagonAlert : tone === 'warn' ? TriangleAlert : Info
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-3xl border p-4 text-sm', styles)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1.5">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}

/**
 * Self-containment warnings (src/lib/selfContained.ts). They never block a
 * save; they tell the author what a fresh AI in another app will be missing.
 */
export function SelfContainedNotice({
  warnings,
}: {
  warnings: readonly SelfContainedWarning[]
}) {
  if (warnings.length === 0) return null
  return (
    <Notice
      tone="warn"
      title={`${warnings.length} thing${warnings.length > 1 ? 's' : ''} another AI may not have`}
    >
      <p className="text-xs text-fg-muted">
        Another AI loads this item with only its own text and files. These do
        not stop you saving.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {warnings.map((w, i) => (
          <li key={`${w.code}${i}`}>
            <code className="break-all font-mono text-xs">{w.where}</code>:{' '}
            {w.message}
          </li>
        ))}
      </ul>
    </Notice>
  )
}

/** Shown instead of any "passed" signal when the linter has nothing to say. */
export const NO_FINDINGS_TEXT =
  'The safety linter has nothing to flag right now. It only knows certain patterns, so this is not a safety check.'
