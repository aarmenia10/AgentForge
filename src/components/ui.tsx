import { BadgeCheck, Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FRAMEWORK_LABELS, type AgentAuthor, type AgentFramework } from '@/types/agent'

/** Joins class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** GitHub mark. Inlined because lucide-react no longer ships brand icons. */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

const FRAMEWORK_STYLES: Record<AgentFramework, string> = {
  mcp_native: 'text-teal-600 dark:text-teal-300',
  crewai: 'text-rose-600 dark:text-rose-300',
  langchain: 'text-emerald-600 dark:text-emerald-300',
  autogen: 'text-indigo-600 dark:text-indigo-300',
  custom: 'text-slate-600 dark:text-slate-300',
}

/** Plain typographic label. Deliberately not a pill. */
export function FrameworkBadge({ framework }: { framework: AgentFramework }) {
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-semibold uppercase tracking-[0.14em]',
        FRAMEWORK_STYLES[framework],
      )}
    >
      {FRAMEWORK_LABELS[framework]}
    </span>
  )
}

/**
 * "Verified author" means the registry confirmed who the author is. It is not
 * a review of the agent, so the wording never shortens to just "Verified".
 */
export const VERIFIED_AUTHOR_LABEL = 'Verified author'
const VERIFIED_AUTHOR_HINT =
  'Verified author: the registry confirmed who this author is. It is not a safety check or a review of the agent.'

export function AuthorTag({
  author,
  link = false,
  showVerifiedLabel = false,
}: {
  author: AgentAuthor
  link?: boolean
  /** Spell the badge out beside the name. Cards stay icon-only for space. */
  showVerifiedLabel?: boolean
}) {
  const badge = author.verified && (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-teal-600 dark:text-teal-300"
      title={VERIFIED_AUTHOR_HINT}
    >
      <BadgeCheck className="size-3.5" aria-hidden={showVerifiedLabel} aria-label={showVerifiedLabel ? undefined : VERIFIED_AUTHOR_LABEL} />
      {showVerifiedLabel && <span>{VERIFIED_AUTHOR_LABEL}</span>}
    </span>
  )
  const identity = (
    <>
      <GitHubIcon className="size-3.5 shrink-0" />
      <span className="truncate">@{author.github}</span>
    </>
  )
  const className =
    'inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400'
  // The badge sits outside the link so its tooltip explains the badge, not the link.
  return (
    <span className={className}>
      {link ? (
        <a
          href={`https://github.com/${author.github}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 hover:text-teal-600 dark:hover:text-teal-300"
        >
          {identity}
        </a>
      ) : (
        identity
      )}
      {badge}
    </span>
  )
}

export function CopyButton({
  text,
  label = 'Copy',
  tone = 'surface',
}: {
  text: string
  label?: string
  /** `onDark` is for buttons sitting on an always-dark code block. */
  tone?: 'surface' | 'onDark'
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
        copied
          ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
          : tone === 'onDark'
            ? 'bg-white/10 text-slate-200 hover:bg-white/20'
            : 'bg-slate-900/5 text-slate-700 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15',
        copied && tone === 'onDark' && 'text-teal-300',
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}

/** Monospace block with a header row and a copy action. */
export function CodeBlock({
  code,
  title,
  copyLabel,
}: {
  code: string
  title: ReactNode
  copyLabel?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-white/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
        <span className="truncate font-mono text-xs text-slate-400">{title}</span>
        <CopyButton text={code} label={copyLabel} tone="onDark" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}
