import { useState } from 'react'
import { cn } from '@/components/ui'
import { smallButton, StatusText } from '@/components/studio/parts'
import type { SkillManifest } from '@/types/skill'
import { FileText, KindLabel } from './parts'
import {
  compareSkills,
  diffLines,
  foldDiff,
  type FileChange,
  type FileChangeStatus,
} from './skillDraft'

const STATUS_TEXT: Record<
  FileChangeStatus,
  { label: string; tone: 'teal' | 'rose' | 'amber' | 'slate' }
> = {
  changed: { label: 'Changed', tone: 'amber' },
  added: { label: 'Added', tone: 'teal' },
  removed: { label: 'Removed', tone: 'rose' },
  unchanged: { label: 'Unchanged', tone: 'slate' },
}

/** The live version and a waiting edit, compared field by field and file by file. */
export function SkillDiff({
  live,
  edit,
}: {
  live: SkillManifest
  edit: SkillManifest
}) {
  const [showSame, setShowSame] = useState(false)
  const { meta, files } = compareSkills(live, edit)
  const changed = files.filter((f) => f.status !== 'unchanged')
  const shown = showSame ? files : changed

  return (
    <div className="space-y-4 text-sm">
      <p>
        {meta.length === 0 && changed.length === 0
          ? 'Nothing differs from the live version.'
          : `Compared with the live version ${live.version}: ${meta.length} detail${meta.length === 1 ? '' : 's'} and ${changed.length} file${changed.length === 1 ? '' : 's'} changed.`}
      </p>
      {meta.length > 0 && (
        <ul className="space-y-2">
          {meta.map((row) => (
            <li key={row.label} className="rounded-3xl bg-surface p-4">
              <p className="mb-2 font-semibold text-fg">{row.label}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Side label="Live now" text={row.before} tone="before" />
                <Side label="Proposed" text={row.after} tone="after" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-3" aria-label="Files compared">
        {shown.map((change) => (
          <FileDiff key={change.path} change={change} />
        ))}
      </ul>
      {files.length > changed.length && (
        <button
          type="button"
          className={smallButton}
          onClick={() => setShowSame(!showSame)}
        >
          {showSame
            ? 'Show only changed files'
            : `Show ${files.length - changed.length} unchanged file${files.length - changed.length === 1 ? '' : 's'} too`}
        </button>
      )}
    </div>
  )
}

function FileDiff({ change }: { change: FileChange }) {
  const status = STATUS_TEXT[change.status]
  const kind = (change.after ?? change.before)!.kind
  const kindChanged =
    change.before && change.after && change.before.kind !== change.after.kind
  return (
    <li className="rounded-3xl bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 break-all font-mono text-xs font-semibold text-fg">
          {change.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3">
          <StatusText tone={status.tone}>{status.label}</StatusText>
          <KindLabel kind={kind} />
        </span>
      </div>
      {kindChanged && (
        <p className="mb-2 text-xs text-fg">
          Kind changed from {change.before!.kind} to {change.after!.kind}.
        </p>
      )}
      {change.status === 'added' && (
        <FileText text={change.after!.content} label={`Added ${change.path}`} />
      )}
      {change.status === 'removed' && (
        <FileText
          text={change.before!.content}
          label={`Removed ${change.path}`}
        />
      )}
      {change.status === 'unchanged' && (
        <FileText
          text={change.after!.content}
          label={`Text of ${change.path}`}
        />
      )}
      {change.status === 'changed' && (
        <LineDiff
          path={change.path}
          before={change.before!.content}
          after={change.after!.content}
        />
      )}
    </li>
  )
}

function LineDiff({
  path,
  before,
  after,
}: {
  path: string
  before: string
  after: string
}) {
  const lines = diffLines(before, after)
  if (!lines)
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Side label="Live now" text={before} tone="before" code />
        <Side label="Proposed" text={after} tone="after" code />
      </div>
    )
  const added = lines.filter((l) => l.type === 'add').length
  const removed = lines.filter((l) => l.type === 'del').length
  return (
    <div>
      <p className="mb-1 text-xs text-fg-muted">
        {added} line{added === 1 ? '' : 's'} added, {removed} removed. Removed
        lines start with −, added lines with +.
      </p>
      <div
        role="region"
        aria-label={`Changes to ${path}`}
        tabIndex={0}
        className="max-h-[28rem] overflow-auto rounded-2xl bg-surface-2 py-2 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-accent-fg"
      >
        {foldDiff(lines).map((line, i) =>
          line.type === 'fold' ? (
            <div key={i} className="px-3 italic text-fg-muted">
              … {line.count} unchanged line{line.count === 1 ? '' : 's'}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-words px-3',
                line.type === 'add' && 'bg-accent/10 text-fg',
                line.type === 'del' && 'bg-surface text-fg-muted',
              )}
            >
              <span aria-hidden="true" className="select-none">
                {line.type === 'add' ? '+ ' : line.type === 'del' ? '− ' : '  '}
              </span>
              {line.type === 'add' && <span className="sr-only">Added: </span>}
              {line.type === 'del' && (
                <span className="sr-only">Removed: </span>
              )}
              {line.text || ' '}
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function Side({
  label,
  text,
  tone,
  code,
}: {
  label: string
  text: string
  tone: 'before' | 'after'
  code?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-fg-muted">{label}</p>
      <pre
        className={cn(
          'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl border-l-2 p-3 text-xs leading-relaxed',
          code ? 'font-mono' : 'font-sans',
          tone === 'before'
            ? 'border-line bg-surface-2'
            : 'border-accent-fg bg-accent/10',
        )}
      >
        {text}
      </pre>
    </div>
  )
}
