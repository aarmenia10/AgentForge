import {
  Braces,
  Eye,
  FileText,
  ListChecks,
  PlugZap,
  ShieldCheck,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { formatCount, formatRelativeTime } from '@/lib/format'
import { TOOL_TYPE_LABELS, type AgentManifest, type AgentTool } from '@/types/agent'
import {
  fetchPublicOrigins,
  publicOriginLabel,
  type OriginApp,
} from '@/lib/portability'
import { VoteButtons } from '@/components/ratings/VoteButtons'
import { CommentsSection } from '@/components/ratings/CommentsSection'
import { ReportDialog } from '@/components/ratings/ReportDialog'
import { fetchRatings, type RatingData } from '@/services/ratings'
import { AuthorLink, cn, CopyButton, FrameworkBadge } from '../ui'
import { agentInstallText } from '@/lib/installText'
import { InstallDialog } from './InstallDialog'
import { InstallPanel } from './InstallPanel'
import { SchemaViewer } from './SchemaViewer'

type TabId = 'overview' | 'tools' | 'schema' | 'install'

const TABS: readonly { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'tools', label: 'Tools & MCP', icon: Wrench },
  { id: 'schema', label: 'Schema Contract', icon: Braces },
  { id: 'install', label: 'Advanced Options', icon: PlugZap },
]

interface AgentDetailModalProps {
  agent: AgentManifest
  onClose: () => void
  /**
   * False for an agent that is not in the public catalog (private, friends,
   * or still waiting for review). AI apps cannot load those, so the install
   * tab would hand out a command that does not work.
   */
  installable?: boolean
}

export function AgentDetailModal({
  agent,
  onClose,
  installable = true,
}: AgentDetailModalProps) {
  const { status, user } = useAuth()
  const uid = status === 'signed-in' && user ? user.uid : null
  const [tab, setTab] = useState<TabId>('overview')
  const tabs = installable ? TABS : TABS.filter((t) => t.id !== 'install')
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const baseId = useId()
  const [originApp, setOriginApp] = useState<OriginApp | null>(null)
  const [rating, setRating] = useState<RatingData | null>(null)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    let active = true
    fetchRatings('agent', agent.id)
      .then((r) => {
        if (active) setRating(r)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [agent.id])

  useEffect(() => {
    let active = true
    if (agent.visibility === 'public') {
      fetchPublicOrigins()
        .then((origins) => {
          if (active) {
            setOriginApp(origins[`${agent.id}@${agent.version}`] ?? null)
          }
        })
        .catch(() => {})
    }
    return () => {
      active = false
    }
  }, [agent.id, agent.version, agent.visibility])

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
    const index = tabs.findIndex((t) => t.id === tab)
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
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-4xl bg-surface shadow-[var(--lm-shadow)] focus:outline-none sm:rounded-4xl"
      >
        <header className="px-5 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FrameworkBadge framework={agent.framework} />
                <span className="font-mono text-xs text-fg-muted">v{agent.version}</span>
              </div>
              <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-tight">
                {agent.name}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                <AuthorLink author={agent.author} showVerifiedLabel />
                <VoteButtons
                  kind="agent"
                  itemId={agent.id}
                  initialThumbsUp={rating?.thumbs_up ?? agent.stats.stars}
                  initialThumbsDown={rating?.thumbs_down ?? 0}
                />
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3.5" />
                  {formatCount(agent.stats.views)} views
                </span>
                <span>Updated {formatRelativeTime(agent.stats.updated_at)}</span>
                {uid && uid !== agent.author.uid && (
                  <button
                    type="button"
                    onClick={() => setShowReport(true)}
                    className="text-xs text-fg-muted hover:text-rose-500"
                  >
                    Report
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-fg-muted">
                Vote totals in the catalog refresh about hourly.
              </p>
              {publicOriginLabel(originApp) && (
                <p className="mt-1 text-xs text-fg-muted">
                  {publicOriginLabel(originApp)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-medium text-fg hover:bg-surface"
            >
              <X className="size-5" aria-hidden="true" />
              Close
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Agent details"
            onKeyDown={onTabKeyDown}
            className="-mx-1 mt-5 flex gap-1 overflow-x-auto border-b border-line px-1"
          >
            {tabs.map(({ id, label, icon: Icon }) => {
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
                      ? 'border-accent text-accent-fg'
                      : 'border-transparent text-fg-muted hover:text-fg',
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
          {tab === 'overview' && <OverviewPanel agent={agent} rating={rating} />}
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

        <footer className="border-t border-line px-5 py-4 sm:px-7">
          <InstallDialog
            kind="Agent"
            name={agent.name}
            directText={agentInstallText(agent)}
            restricted={!installable}
            connectedText={installable ? `Use AgentLemon to load agent ${agent.id}@${agent.version} and follow its blueprint for my task.` : undefined}
            limitation={agent.tools_required.length ? 'This agent requires companion tools. Their actions may be unavailable until you connect those tools separately.' : 'This agent needs no companion tools.'}
          />
        </footer>
      </div>

      {showReport && (
        <ReportDialog
          kind="agent"
          itemId={agent.id}
          targetType="item"
          targetId={agent.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}

function OverviewPanel({
  agent,
  rating,
}: {
  agent: AgentManifest
  rating: RatingData | null
}) {
  const { system_prompt, instructions, verification_rules } = agent.prompt_blueprint
  return (
    <div className="space-y-7">
      <section>
        <p className="leading-relaxed text-fg">{agent.description}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
          {agent.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted"
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
        <blockquote className="rounded-2xl border-l-2 border-accent bg-page p-4 text-sm leading-relaxed text-fg">
          {system_prompt}
        </blockquote>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-accent-fg" />
          How it reasons, step by step
        </h3>
        <ol className="space-y-2.5">
          {instructions.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm text-fg">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent-fg">
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
            <ShieldCheck className="size-4 text-accent-fg" />
            Verification rules
          </h3>
          <ul className="space-y-2">
            {verification_rules.map((rule, index) => (
              <li
                key={index}
                className="rounded-2xl bg-page px-4 py-3 text-sm text-fg"
              >
                {rule}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-4 border-t border-line">
        <h3 className="mb-3 text-sm font-semibold">Comments</h3>
        <CommentsSection
          kind="agent"
          itemId={agent.id}
          initialComments={rating?.comments ?? []}
          authorUid={agent.author.uid}
        />
      </section>
    </div>
  )
}

const TOOL_TYPE_STYLES: Record<AgentTool['type'], string> = {
  mcp_tool: 'text-accent-fg',
  python_function: 'text-amber-700 dark:text-amber-300',
  rest_api: 'text-indigo-700 dark:text-indigo-300',
}

function ToolsPanel({ tools }: { tools: AgentTool[] }) {
  if (tools.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-muted">
        This agent needs no companion tools. It runs on the model alone.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {tools.map((tool) => (
        <li
          key={`${tool.type}:${tool.name}`}
          className="rounded-2xl bg-page p-4"
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
          <p className="mt-1.5 text-sm text-fg-muted">{tool.description}</p>
          {tool.endpoint && (
            <div className="mt-3 flex items-center gap-2 rounded-full bg-surface py-1.5 pl-4 pr-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
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
