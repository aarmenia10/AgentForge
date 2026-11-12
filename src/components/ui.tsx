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

/** Framework as plain monospace text. No fill, no pill. */
export function FrameworkBadge({ framework }: { framework: AgentFramework }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
      {FRAMEWORK_LABELS[framework]}
    </span>
  )
}

export function AuthorTag({ author, link = false }: { author: AgentAuthor; link?: boolean }) {
  const content = (
    <>
      <GitHubIcon className="size-3.5 shrink-0" />
      <span className="truncate">{author.github}</span>
      {author.verified && (
        <BadgeCheck className="size-3.5 shrink-0 text-accent" aria-label="Verified author" />
      )}
    </>
  )
  const className = 'inline-flex min-w-0 items-center gap-1 text-xs text-muted'
  return link ? (
    <a
      href={`https://github.com/${author.github}`}
      target="_blank"
      rel="noreferrer"
      className={cn(className, 'rounded underline-offset-2 hover:text-ink hover:underline')}
    >
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
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
    <button type="button" onClick={copy} className={cn('btn-quiet shrink-0', copied && 'text-ink')}>
      {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
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
    <div className="overflow-hidden rounded-md border border-line bg-sunken">
      <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 pr-1.5 pl-3">
        <span className="truncate font-mono text-xs text-muted">{title}</span>
        <CopyButton text={code} label={copyLabel} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  )
}
