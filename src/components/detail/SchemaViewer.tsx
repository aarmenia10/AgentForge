import { useState } from 'react'
import type { JsonSchema } from '@/types/agent'
import { cn, CodeBlock, CopyButton } from '../ui'

interface SchemaViewerProps {
  title: string
  filename: string
  schema: JsonSchema
}

function describeType(node: JsonSchema): string {
  if (Array.isArray(node.enum)) return node.enum.map((v: unknown) => JSON.stringify(v)).join(' | ')
  if (node.type === 'array') return `${node.items ? describeType(node.items) : 'any'}[]`
  if (Array.isArray(node.type)) return node.type.join(' | ')
  const base = typeof node.type === 'string' ? node.type : 'any'
  return node.format ? `${base} (${node.format})` : base
}

/** Field table for the top-level properties, with the raw document one click away. */
export function SchemaViewer({ title, filename, schema }: SchemaViewerProps) {
  const [view, setView] = useState<'fields' | 'raw'>('fields')
  const raw = JSON.stringify(schema, null, 2)
  const properties: [string, JsonSchema][] = Object.entries(schema.properties ?? {})
  const required = new Set<string>(Array.isArray(schema.required) ? schema.required : [])

  return (
    <section>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-900/5 p-0.5 text-xs dark:bg-white/10">
            {(['fields', 'raw'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition',
                  view === option
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {option === 'fields' ? 'Fields' : 'JSON'}
              </button>
            ))}
          </div>
          {view === 'fields' && <CopyButton text={raw} label="Copy schema" />}
        </div>
      </header>

      {view === 'raw' ? (
        <CodeBlock code={raw} title={filename} copyLabel="Copy schema" />
      ) : properties.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
          This schema declares no top-level properties. Switch to JSON to see the full document.
        </p>
      ) : (
        <ul className="divide-y divide-slate-900/5 overflow-hidden rounded-xl border border-slate-200 dark:divide-white/10 dark:border-white/10">
          {properties.map(([name, node]) => (
            <li key={name} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
              <div className="min-w-0">
                <code className="break-all font-mono text-sm font-medium text-slate-900 dark:text-white">
                  {name}
                </code>
                {required.has(name) && (
                  <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    required
                  </span>
                )}
                <p className="mt-0.5 break-words font-mono text-xs text-teal-700 dark:text-teal-300">
                  {describeType(node)}
                </p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {node.description ?? <span className="text-slate-400">No description.</span>}
                {node.default !== undefined && (
                  <span className="ml-1 text-slate-400">
                    Default: <code className="font-mono">{JSON.stringify(node.default)}</code>
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
