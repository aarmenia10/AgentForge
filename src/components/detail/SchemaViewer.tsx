import { useState } from 'react'
import type { JsonSchema } from '@/types/agent'
import { CodeBlock, CopyButton } from '../ui'

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
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="segmented">
            {(['fields', 'raw'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className="segment h-6 text-xs"
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
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted">
          This schema declares no top-level properties. Switch to JSON to see the full document.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {properties.map(([name, node]) => (
            <li key={name} className="grid gap-1 p-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
              <div className="min-w-0">
                <code className="font-mono text-sm font-medium break-all">{name}</code>
                {required.has(name) && (
                  <span className="ml-2 text-[11px] tracking-wider text-subtle uppercase">
                    required
                  </span>
                )}
                <p className="mt-0.5 font-mono text-xs break-words text-muted">
                  {describeType(node)}
                </p>
              </div>
              <p className="text-sm text-muted">
                {node.description ?? <span className="text-subtle">No description.</span>}
                {node.default !== undefined && (
                  <span className="ml-1 text-subtle">
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
