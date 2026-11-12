import { Star, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatCount, formatRelativeTime } from '@/lib/format'
import { TOOL_TYPE_LABELS, type AgentManifest, type AgentTool } from '@/types/agent'
import { AuthorTag, cn, CopyButton, FrameworkBadge } from '../ui'
import { InstallPanel } from './InstallPanel'
import { SchemaViewer } from './SchemaViewer'

type TabId = 'overview' | 'tools' | 'schema' | 'install'

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tools', label: 'Tools' },
  { id: 'schema', label: 'Schema' },
  { id: 'install', label: 'Install' },
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
      <div className="absolute inset-0 bg-navy-950/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-md border border-line bg-surface focus:outline-none sm:rounded-md"
      >
        <header className="px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight">
                {agent.name}
                <span className="ml-2 font-mono text-xs font-normal text-subtle">
                  v{agent.version}
                </span>
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                <FrameworkBadge framework={agent.framework} />
                <AuthorTag author={agent.author} link />
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5" aria-hidden="true" />
                  {formatCount(agent.stats.stars)} stars
                </span>
                <span>{formatCount(agent.stats.views)} views</span>
                <span>Updated {formatRelativeTime(agent.stats.updated_at)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded text-muted hover:bg-sunken hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Agent details"
            onKeyDown={onTabKeyDown}
            className="mt-4 flex gap-5 border-b border-line"
          >
            {TABS.map(({ id, label }) => {
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
                    '-mb-px border-b-2 pb-2 text-sm focus-visible:outline-offset-[-2px]',
                    selected
                      ? 'border-accent font-medium text-ink'
                      : 'border-transparent text-muted hover:text-ink',
                  )}
                >
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
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          {tab === 'overview' && <OverviewPanel agent={agent} />}
          {tab === 'tools' && <ToolsPanel tools={agent.tools_required} />}
          {tab === 'schema' && (
            <div className="space-y-7">
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
          <footer className="border-t border-line px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setTab('install')}
              className="btn-primary w-full sm:w-auto"
            >
              Install this agent
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function OverviewPanel({ agent }: { agent: AgentManifest }) {
  const { system_prompt, instructions, verification_rules } = agent.prompt_blueprint
  return (
    <div className="space-y-6">
      <section>
        <p className="text-[15px] leading-relaxed">{agent.description}</p>
        <p className="mt-2 text-xs text-subtle">
          <span className="sr-only">Tags: </span>
          {agent.tags.join(', ')}
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="eyebrow">System prompt</h3>
          <CopyButton text={system_prompt} label="Copy prompt" />
        </div>
        <blockquote className="rounded-md border border-line bg-sunken p-3 text-sm leading-relaxed">
          {system_prompt}
        </blockquote>
      </section>

      <section>
        <h3 className="eyebrow mb-2">Instructions</h3>
        <ol className="space-y-1.5">
          {instructions.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed">
              <span className="w-4 shrink-0 text-right font-mono text-xs leading-[1.625rem] text-subtle">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {verification_rules.length > 0 && (
        <section>
          <h3 className="eyebrow mb-2">Verification rules</h3>
          <ul className="divide-y divide-line rounded-md border border-line">
            {verification_rules.map((rule, index) => (
              <li key={index} className="px-3 py-2 text-sm leading-relaxed">
                {rule}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ToolsPanel({ tools }: { tools: AgentTool[] }) {
  if (tools.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-5 text-center text-sm text-muted">
        This agent needs no companion tools. It runs on the model alone.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {tools.map((tool) => (
        <li key={`${tool.type}:${tool.name}`} className="p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <code className="font-mono text-sm font-medium break-all">{tool.name}</code>
            <span className="font-mono text-[11px] tracking-wider text-subtle uppercase">
              {TOOL_TYPE_LABELS[tool.type]}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{tool.description}</p>
          {tool.endpoint && (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
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
