import {
  Braces,
  Eye,
  FileText,
  ListChecks,
  PlugZap,
  ShieldCheck,
  Star,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { agentRepository } from '@/lib/agentRepository'
import { formatCount, formatRelativeTime } from '@/lib/format'
import { TOOL_TYPE_LABELS, type AgentManifest, type AgentTool } from '@/types/agent'
import { AuthorLink, cn, CopyButton, FrameworkBadge } from '../ui'
import { InstallPanel } from './InstallPanel'
import { SchemaViewer } from './SchemaViewer'

type TabId = 'overview' | 'tools' | 'schema' | 'install'

const TABS: readonly { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'tools', label: 'Tools & MCP', icon: Wrench },
  { id: 'schema', label: 'Schema Contract', icon: Braces },
  { id: 'install', label: 'Add to Claude / Cursor', icon: PlugZap },
]

interface AgentDetailModalProps {
  agent: AgentManifest
  onClose: () => void
}

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const [tab, setTab] = useState<TabId>('overview')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const baseId = useId()

  // Lock page scroll, move focus in, and restore both on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    // Keep keyboard focus inside the dialog.
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.id === tab)
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = TABS[(index + delta + TABS.length) % TABS.length]
    setTab(next.id)
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className="glass-strong relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl focus:outline-none sm:rounded-3xl"
      >
        <header className="px-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FrameworkBadge framework={agent.framework} />
                <span className="font-mono text-xs text-slate-400">v{agent.version}</span>
              </div>
              <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-tight">
                {agent.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <AuthorLink author={agent.author} showVerifiedLabel />
                <StarButton agent={agent} />
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3.5" />
                  {formatCount(agent.stats.views)} views
                </span>
                <span>Updated {formatRelativeTime(agent.stats.updated_at)}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Star totals in the catalog refresh about hourly.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Agent details"
            onKeyDown={onTabKeyDown}
            className="-mx-1 mt-5 flex gap-1 overflow-x-auto border-b border-slate-900/10 px-1 dark:border-white/10"
          >
            {TABS.map(({ id, label, icon: Icon }) => {
              const selected = tab === id
              return (
                <button
                  key={id}
                  id={`${baseId}-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(id)}
                  className={cn(
                    '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition',
                    selected
                      ? 'border-teal-500 text-teal-600 dark:text-teal-300'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              )
            })}
          </div>
        </header>

        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7"
        >
          {tab === 'overview' && <OverviewPanel agent={agent} />}
          {tab === 'tools' && <ToolsPanel tools={agent.tools_required} />}
          {tab === 'schema' && (
            <div className="space-y-8">
              <SchemaViewer title="Input" filename="input_schema.json" schema={agent.input_schema} />
              <SchemaViewer
                title="Output"
                filename="output_schema.json"
                schema={agent.output_schema}
              />
            </div>
          )}
          {tab === 'install' && <InstallPanel agent={agent} />}
        </div>

        {tab !== 'install' && (
          <footer className="border-t border-slate-900/10 px-5 py-4 sm:px-7 dark:border-white/10">
            <button
              type="button"
              onClick={() => setTab('install')}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-teal-500/25 transition hover:bg-teal-600 sm:w-auto"
            >
              <PlugZap className="size-4" />
              Add to Claude / Cursor
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

/**
 * Reads whether this user starred the agent. Loads Firestore only here, when a
 * signed-in user opens a detail view. Null when it cannot tell, for example
 * because the agent has no live document yet.
 */
async function readOwnStar(agentId: string, uid: string): Promise<boolean | null> {
  const [{ getFirebaseServices }, { doc, getDoc }] = await Promise.all([
    import('@/lib/firebase'),
    import('firebase/firestore'),
  ])
  const { db, auth } = getFirebaseServices()
  await auth.authStateReady()
  if (auth.currentUser?.uid !== uid) return null
  const star = await getDoc(doc(db, 'agents', agentId, 'stars', uid))
  return star.exists()
}

function describeStarError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code).replace(/^firestore\//, '')
      : null
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return 'Could not reach the server, so your star was not saved. Try again.'
  if (code === 'resource-exhausted')
    return 'The site has reached its daily limit. Try again tomorrow.'
  if (error instanceof Error && /^Agent does not exist/.test(error.message))
    return 'Stars are not open for this agent yet.'
  if (error instanceof Error && /^Sign in/.test(error.message))
    return 'Your session ended. Sign in again to star agents.'
  return 'Could not save your star. Try again.'
}

/**
 * A star icon and the count, no pill (README 7.1). Signed out, it asks for
 * sign-in. Signed in, it toggles at once and reverts on failure.
 */
function StarButton({ agent }: { agent: AgentManifest }) {
  const { status, user, openSignIn } = useAuth()
  const uid = status === 'signed-in' && user ? user.uid : null
  const [count, setCount] = useState(agent.stats.stars)
  const [starred, setStarred] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setStarred(null)
    if (!uid) return
    let active = true
    readOwnStar(agent.id, uid)
      .then((value) => active && setStarred(value))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [agent.id, uid])

  async function onClick() {
    if (!uid) {
      openSignIn({ reason: 'Sign in to star this agent.' })
      return
    }
    if (busy) return
    const before = { count, starred }
    if (starred !== null) {
      setStarred(!starred)
      setCount(Math.max(0, count + (starred ? -1 : 1)))
    }
    setBusy(true)
    setMessage(null)
    try {
      const next = await agentRepository.toggleStar(agent.id, uid)
      setCount(next)
      if (before.starred === null)
        setStarred(await readOwnStar(agent.id, uid).catch(() => null))
    } catch (error) {
      setCount(before.count)
      setStarred(before.starred)
      setMessage(describeStarError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={uid && starred !== null ? starred : undefined}
        aria-busy={busy || undefined}
        aria-label={`${starred ? 'Starred' : 'Star this agent'}, ${formatCount(count)} stars`}
        title={uid ? (starred ? 'Remove your star' : 'Star this agent') : 'Sign in to star this agent'}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:text-amber-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500 dark:hover:text-amber-300"
      >
        <Star
          aria-hidden="true"
          className={cn(
            'size-3.5 text-amber-500',
            starred && 'fill-amber-400 text-amber-400',
          )}
        />
        <span className="tabular-nums">{formatCount(count)}</span> stars
      </button>
      {message && (
        <span role="status" className="basis-full text-rose-700 dark:text-rose-300">
          {message}
        </span>
      )}
    </>
  )
}

function OverviewPanel({ agent }: { agent: AgentManifest }) {
  const { system_prompt, instructions, verification_rules } = agent.prompt_blueprint
  return (
    <div className="space-y-7">
      <section>
        <p className="leading-relaxed text-slate-700 dark:text-slate-200">{agent.description}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
          {agent.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300"
            >
              #{tag}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">System prompt</h3>
          <CopyButton text={system_prompt} label="Copy prompt" />
        </div>
        <blockquote className="rounded-xl border-l-2 border-teal-500 bg-slate-900/5 p-4 text-sm leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-200">
          {system_prompt}
        </blockquote>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-teal-500" />
          How it reasons, step by step
        </h3>
        <ol className="space-y-2.5">
          {instructions.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm text-slate-700 dark:text-slate-200">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-500/15 text-xs font-semibold text-teal-700 dark:text-teal-300">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {verification_rules.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-teal-500" />
            Verification rules
          </h3>
          <ul className="space-y-2">
            {verification_rules.map((rule, index) => (
              <li
                key={index}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200"
              >
                {rule}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const TOOL_TYPE_STYLES: Record<AgentTool['type'], string> = {
  mcp_tool: 'text-teal-700 dark:text-teal-300',
  python_function: 'text-amber-700 dark:text-amber-300',
  rest_api: 'text-indigo-700 dark:text-indigo-300',
}

function ToolsPanel({ tools }: { tools: AgentTool[] }) {
  if (tools.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
        This agent needs no companion tools. It runs on the model alone.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {tools.map((tool) => (
        <li
          key={`${tool.type}:${tool.name}`}
          className="rounded-xl border border-slate-200 p-4 dark:border-white/10"
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all font-mono text-sm font-medium">{tool.name}</code>
            <span
              className={cn(
                'font-mono text-[11px] font-semibold uppercase tracking-[0.14em]',
                TOOL_TYPE_STYLES[tool.type],
              )}
            >
              {TOOL_TYPE_LABELS[tool.type]}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{tool.description}</p>
          {tool.endpoint && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-900/5 py-1.5 pl-3 pr-1.5 dark:bg-white/5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300">
                {tool.endpoint}
              </code>
              <CopyButton text={tool.endpoint} label="Copy endpoint" />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
