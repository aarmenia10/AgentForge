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

/* Shared pieces for the Studio, My agents, and the review queue. */

export const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-400 dark:text-navy-950 dark:hover:bg-teal-300'

export const secondaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900/5 px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15'

export const dangerButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-400 dark:text-navy-950 dark:hover:bg-rose-300'

export const smallButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900/5 px-3 text-xs font-medium text-slate-800 transition hover:bg-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15'

export const textLink =
  'font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-300'

export function inputClass(invalid = false) {
  return cn(
    'w-full rounded-xl border bg-white/70 px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-teal-500 disabled:opacity-60 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-400',
    invalid
      ? 'border-rose-500 dark:border-rose-400'
      : 'border-slate-300 dark:border-white/15',
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
    slate: 'text-slate-600 dark:text-slate-300',
    teal: 'text-teal-700 dark:text-teal-300',
    amber: 'text-amber-700 dark:text-amber-300',
    rose: 'text-rose-700 dark:text-rose-300',
    indigo: 'text-indigo-700 dark:text-indigo-300',
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
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-100"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
          {hint}
        </p>
      )}
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
        'flex gap-2 rounded-lg border px-3 py-2 text-xs',
        block
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100',
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
          <p className="break-words font-mono opacity-90">
            “{finding.excerpt}”
          </p>
        )}
        <p className="opacity-90">{SEVERITY_TEXT[finding.severity]}.</p>
      </div>
    </div>
  )
}

export function ProblemNote({ problem }: { problem: Problem }) {
  return (
    <p className="text-xs text-rose-700 dark:text-rose-300">
      {problem.message}
    </p>
  )
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
    info: 'border-slate-300 bg-white/50 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-100',
    success:
      'border-teal-500/40 bg-teal-500/10 text-teal-950 dark:text-teal-100',
  }[tone]
  const Icon =
    tone === 'error' ? OctagonAlert : tone === 'warn' ? TriangleAlert : Info
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-xl border p-3 text-sm', styles)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1.5">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}

/** Shown instead of any "passed" signal when the linter has nothing to say. */
export const NO_FINDINGS_TEXT =
  'The safety linter has nothing to flag right now. It only knows certain patterns, so this is not a safety check.'
