import {
  FileCode2,
  FileText as FileTextIcon,
  Globe,
  Lock,
  ScrollText,
  Users,
} from 'lucide-react'
import { cn } from '@/components/ui'
import { StatusText } from '@/components/studio/parts'
import { formatBytes } from '@/lib/skillRepository'
import { SKILL_MAX_FILES, SKILL_MAX_TOTAL_BYTES } from '@/lib/skillSchema'
import type { SkillFileKind, SkillRecord, SkillVisibility } from '@/types/skill'

/* Shared pieces for the skill upload, My items, detail, and review screens. */

/** The script rule in one plain sentence (owner decision of 2026-11-18). */
export const SCRIPT_RULE =
  'Scripts can stay in a private skill; remove them to share it with friends or submit it for public review.'

export const SKILL_VISIBILITY_CHOICES: {
  value: SkillVisibility
  label: string
  line: string
  icon: typeof Lock
}[] = [
  {
    value: 'private',
    label: 'Private',
    line: 'Only you can see it. Saved right away. Scripts are allowed.',
    icon: Lock,
  },
  {
    value: 'friends',
    label: 'Friends',
    line: 'You and your accepted friends can see it, right away. Text files only.',
    icon: Users,
  },
  {
    value: 'public',
    label: 'Public',
    line: 'Everyone can find it and load it from an AI app. Reviewed by a person first, then appears within about an hour. Text files only.',
    icon: Globe,
  },
]

/** Review status only means something for public skills. */
export function SkillReviewLabel({
  record,
}: {
  record: Pick<SkillRecord, 'visibility' | 'review_status'>
}) {
  if (record.visibility !== 'public')
    return <StatusText>No review needed</StatusText>
  if (record.review_status === 'approved')
    return <StatusText tone="teal">Approved</StatusText>
  if (record.review_status === 'rejected')
    return <StatusText tone="rose">Not approved</StatusText>
  return <StatusText tone="amber">Waiting for review</StatusText>
}

const KIND_TEXT: Record<SkillFileKind, string> = {
  instructions: 'Instructions',
  reference: 'Reference',
  script: 'Script',
}

export function KindLabel({ kind }: { kind: SkillFileKind }) {
  const Icon =
    kind === 'instructions'
      ? ScrollText
      : kind === 'script'
        ? FileCode2
        : FileTextIcon
  return (
    <StatusText
      tone={
        kind === 'script' ? 'rose' : kind === 'instructions' ? 'teal' : 'slate'
      }
      icon={<Icon className="size-3" aria-hidden="true" />}
    >
      {KIND_TEXT[kind]}
    </StatusText>
  )
}

/** Plain typographic label for the item kind, like FrameworkBadge. */
export function SkillBadge() {
  return (
    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">
      Skill
    </span>
  )
}

function Bar({
  id,
  label,
  value,
  max,
  text,
}: {
  id: string
  label: string
  value: number
  max: number
  text: string
}) {
  const ratio = Math.min(1, value / max)
  const over = value > max
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span
          id={id}
          className="font-medium text-slate-800 dark:text-slate-100"
        >
          {label}
        </span>
        <span
          className={cn(
            'tabular-nums',
            over
              ? 'font-semibold text-rose-700 dark:text-rose-300'
              : 'text-slate-600 dark:text-slate-400',
          )}
        >
          {text}
        </span>
      </div>
      <div
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={text}
        className="mt-1 h-2 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width]',
            over
              ? 'bg-rose-600 dark:bg-rose-400'
              : ratio > 0.85
                ? 'bg-amber-500 dark:bg-amber-400'
                : 'bg-teal-600 dark:bg-teal-400',
          )}
          style={{ width: `${Math.max(ratio * 100, value > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  )
}

/** Size and file count against the 200 KB and 50-file limits. */
export function SizeMeter({
  bytes,
  files,
  idBase,
}: {
  bytes: number
  files: number
  idBase: string
}) {
  return (
    <div className="space-y-3">
      <Bar
        id={`${idBase}-size`}
        label="Size"
        value={bytes}
        max={SKILL_MAX_TOTAL_BYTES}
        text={`${formatBytes(bytes)} of 200 KB`}
      />
      <Bar
        id={`${idBase}-count`}
        label="Files"
        value={files}
        max={SKILL_MAX_FILES}
        text={`${files} of ${SKILL_MAX_FILES}`}
      />
    </div>
  )
}

/** A file's text, shown as text and never as markup. */
export function FileText({ text, label }: { text: string; label: string }) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/5 p-3 font-mono text-xs leading-relaxed text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-500 dark:bg-white/5 dark:text-slate-100"
    >
      {text}
    </pre>
  )
}
