import { ArrowRight, BadgeCheck, Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FRAMEWORK_LABELS, type AgentAuthor, type AgentFramework } from '@/types/agent'
import { Link } from '@/router/Router'
import { COPY_CONFIRMATION_MS, copyText } from '@/lib/clipboard'

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

/**
 * Primary action: accent fill, pill shape, an arrow, and a gentle lift on
 * hover. Put `<ArrowIcon />` last inside it.
 */
export const primaryButtonClass =
  'group/btn inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-accent-ink transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_var(--lm-accent)] disabled:cursor-not-allowed disabled:opacity-50'

export function ArrowIcon() {
  return (
    <ArrowRight
      aria-hidden="true"
      className="size-4 transition-transform duration-200 group-hover/btn:translate-x-0.5"
    />
  )
}

const FRAMEWORK_STYLES: Record<AgentFramework, string> = {
  mcp_native: 'text-accent-fg',
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
  showVerifiedLabel = false,
}: {
  author: AgentAuthor
  /** Spell the badge out beside the name. Cards stay icon-only for space. */
  showVerifiedLabel?: boolean
}) {
  const badge = author.verified && (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-accent-fg"
      title={VERIFIED_AUTHOR_HINT}
    >
      <BadgeCheck className="size-3.5" aria-hidden={showVerifiedLabel} aria-label={showVerifiedLabel ? undefined : VERIFIED_AUTHOR_LABEL} />
      {showVerifiedLabel && <span>{VERIFIED_AUTHOR_LABEL}</span>}
    </span>
  )
  const className =
    'inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-fg-muted'
  return (
    <span className={className}>
      <span className="truncate underline-offset-2 group-hover/author:underline">
        @{author.handle}
      </span>
      {badge}
    </span>
  )
}

/**
 * The author tag as a link to the author's public profile at /u/<handle>.
 * Raised above a card's stretched click target so it stays clickable.
 */
export function AuthorLink({
  author,
  showVerifiedLabel = false,
  onNavigate,
}: {
  author: AgentAuthor
  showVerifiedLabel?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      to={`/u/${author.handle}`}
      onClick={onNavigate}
      title={`See all public agents from @${author.handle}`}
      className="group/author relative z-10 inline-flex min-w-0 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
    >
      <AuthorTag author={author} showVerifiedLabel={showVerifiedLabel} />
    </Link>
  )
}

export function CopyButton({
  text,
  label = 'Copy',
  tone = 'surface',
  onResult,
}: {
  text: string | null
  label?: string
  /** `onDark` is for buttons sitting on an always-dark code block. */
  tone?: 'surface' | 'onDark' | 'primary'
  onResult?: (manualText: string | null) => void
}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>(
    'idle',
  )
  const timer = useRef<number | undefined>(undefined)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  async function copy() {
    if (!text) return
    window.clearTimeout(timer.current)
    setStatus('copying')
    const result = await copyText(text)
    if (!active.current) return
    setStatus(result)
    onResult?.(result === 'copied' ? null : text)
    if (result === 'copied') {
      timer.current = window.setTimeout(
        () => setStatus('idle'),
        COPY_CONFIRMATION_MS,
      )
    }
  }

  const copied = status === 'copied'
  const emphasize = status === 'idle' || status === 'copying'
  return (
    <button
      type="button"
      disabled={!text || status === 'copying'}
      onClick={copy}
      className={cn(
        tone === 'primary'
          ? copied
            ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300'
            : emphasize
              ? 'group/btn inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 py-2 text-base font-bold text-accent-ink transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-12px_var(--lm-accent)] disabled:cursor-not-allowed disabled:opacity-50'
              : primaryButtonClass
          : emphasize
            ? 'inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition'
            : 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
        copied
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : tone === 'onDark'
            ? emphasize
              ? 'bg-accent/20 text-white hover:bg-accent/30'
              : 'bg-white/10 text-slate-200 hover:bg-white/20'
            : tone === 'surface' &&
              (emphasize
                ? 'bg-accent/15 text-fg hover:bg-accent/25'
                : 'bg-slate-900/5 text-slate-700 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15'),
        copied && tone === 'onDark' && 'text-emerald-300',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]',
      )}
    >
      {copied ? (
        <Check className="size-4 shrink-0 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className={emphasize ? 'size-4 shrink-0' : 'size-3.5'} aria-hidden="true" />
      )}
      <span aria-live="polite">
        {copied
          ? 'Successfully copied!'
          : status === 'error'
            ? 'Copy failed. Try again.'
            : label}
      </span>
    </button>
  )
}

export const copyInstructionClass =
  'rounded-lg bg-accent/15 px-3 py-2 text-base font-bold leading-snug text-fg'

const copyDarkInstructionClass =
  'rounded-lg bg-accent/15 px-3 py-2 text-base font-bold leading-snug text-white'

const COPY_CHAT_INSTRUCTION = 'Copy this into your AI chat'

/** Shared, theme-aware instruction for copying prompts into an AI chat. */
export function CopyChatInstruction({ onDark = false }: { onDark?: boolean }) {
  return (
    <strong
      className={cn(
        'block min-w-0',
        onDark ? copyDarkInstructionClass : copyInstructionClass,
      )}
    >
      {COPY_CHAT_INSTRUCTION}
    </strong>
  )
}

/** Monospace block with a header row and a copy action. */
export function CodeBlock({
  code,
  title,
  copyLabel,
  wrap = false,
  emphasizeTitle = false,
}: {
  code: string
  title: ReactNode
  copyLabel?: string
  /** Opt in for a short, direct copy instruction used as the title. */
  emphasizeTitle?: boolean
  /** Wrap long lines instead of scrolling sideways (prose prompts). */
  wrap?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-white/10">
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2',
          (emphasizeTitle || title === COPY_CHAT_INSTRUCTION) && 'flex-wrap',
        )}
      >
        {title === COPY_CHAT_INSTRUCTION ? (
          <CopyChatInstruction onDark />
        ) : (
          <span
            className={
              emphasizeTitle
                ? cn('min-w-0 break-words', copyDarkInstructionClass)
                : 'truncate font-mono text-xs text-slate-400'
            }
          >
            {title}
          </span>
        )}
        <CopyButton text={code} label={copyLabel} tone="onDark" />
      </div>
      <pre
        className={cn(
          'p-4 font-mono text-[13px] leading-relaxed text-slate-100',
          wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto',
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}
