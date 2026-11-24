import { useState } from 'react'
import { cn } from '@/components/ui'
import { sameJson } from '@/lib/studioManifest'
import { FRAMEWORK_LABELS, type AgentManifest } from '@/types/agent'
import { smallButton } from '@/components/studio/parts'

interface Row {
  label: string
  before: string
  after: string
  /** Render as preformatted monospace (JSON). */
  code?: boolean
}

function rows(live: AgentManifest, edit: AgentManifest): Row[] {
  const json = (v: unknown) => JSON.stringify(v, null, 2)
  const list = (items: string[]) =>
    items.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const out: Row[] = [
    { label: 'Name', before: live.name, after: edit.name },
    { label: 'Version', before: live.version, after: edit.version },
    { label: 'Description', before: live.description, after: edit.description },
    {
      label: 'Tags',
      before: live.tags.join(', '),
      after: edit.tags.join(', '),
    },
    {
      label: 'AI Technology',
      before: FRAMEWORK_LABELS[live.framework],
      after: FRAMEWORK_LABELS[edit.framework],
    },
    { label: 'Visibility', before: live.visibility, after: edit.visibility },
    {
      label: 'Agent Instructions',
      before: live.prompt_blueprint.system_prompt,
      after: edit.prompt_blueprint.system_prompt,
    },
  ]
  const steps = Math.max(
    live.prompt_blueprint.instructions.length,
    edit.prompt_blueprint.instructions.length,
  )
  for (let i = 0; i < steps; i++)
    out.push({
      label: `Instructions, step ${i + 1}`,
      before: live.prompt_blueprint.instructions[i] ?? '(none)',
      after: edit.prompt_blueprint.instructions[i] ?? '(removed)',
    })
  out.push({
    label: 'Verification rules',
    before: list(live.prompt_blueprint.verification_rules),
    after: list(edit.prompt_blueprint.verification_rules),
  })
  out.push(
    {
      label: 'Required tools',
      before: json(live.tools_required),
      after: json(edit.tools_required),
      code: true,
    },
    {
      label: 'Input Format',
      before: json(live.input_schema),
      after: json(edit.input_schema),
      code: true,
    },
    {
      label: 'Output Format',
      before: json(live.output_schema),
      after: json(edit.output_schema),
      code: true,
    },
  )
  return out
}

/** Field-by-field comparison of the live version and a proposed edit. */
export function ManifestDiff({
  live,
  edit,
}: {
  live: AgentManifest
  edit: AgentManifest
}) {
  const [showAll, setShowAll] = useState(false)
  const all = rows(live, edit)
  const changed = all.filter((r) => !sameJson(r.before, r.after))
  const shown = showAll ? all : changed

  return (
    <div className="space-y-3 text-sm">
      <p>
        {changed.length === 0
          ? 'No field differs from the live version.'
          : `${changed.length} field${changed.length > 1 ? 's' : ''} changed from the live version ${live.version}.`}
      </p>
      <ul className="space-y-3">
        {shown.map((row) => {
          const same = row.before === row.after
          return (
            <li key={row.label} className="rounded-3xl bg-surface p-4">
              <p className="mb-2 font-semibold text-fg">
                {row.label}
                {same && (
                  <span className="ml-2 font-normal text-fg-muted">
                    unchanged
                  </span>
                )}
              </p>
              {same ? (
                <Cell text={row.after} code={row.code} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-fg-muted">
                      Live now
                    </p>
                    <Cell text={row.before} code={row.code} tone="before" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-fg-muted">
                      Proposed
                    </p>
                    <Cell text={row.after} code={row.code} tone="after" />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className={smallButton}
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? 'Show only changed fields' : 'Show unchanged fields too'}
      </button>
    </div>
  )
}

function Cell({
  text,
  code,
  tone,
}: {
  text: string
  code?: boolean
  tone?: 'before' | 'after'
}) {
  return (
    <pre
      className={cn(
        'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border-l-2 p-3 text-xs leading-relaxed',
        code ? 'font-mono' : 'font-sans',
        tone === 'before'
          ? 'border-line bg-surface-2'
          : tone === 'after'
            ? 'border-accent-fg bg-accent/10'
            : 'border-line bg-surface-2',
      )}
    >
      {text}
    </pre>
  )
}
