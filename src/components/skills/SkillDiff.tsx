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
            <li
              key={row.label}
              className="rounded-lg border border-slate-900/10 p-3 dark:border-white/10"
            >
              <p className="mb-2 font-semibold text-slate-900 dark:text-white">
                {row.label}
              </p>
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
    <li className="rounded-lg border border-slate-900/10 p-3 dark:border-white/10">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 break-all font-mono text-xs font-semibold text-slate-900 dark:text-white">
          {change.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3">
          <StatusText tone={status.tone}>{status.label}</StatusText>
          <KindLabel kind={kind} />
        </span>
      </div>
      {kindChanged && (
        <p className="mb-2 text-xs text-rose-700 dark:text-rose-300">
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
      <p className="mb-1 text-xs text-slate-600 dark:text-slate-400">
        {added} line{added === 1 ? '' : 's'} added, {removed} removed. Removed
        lines start with −, added lines with +.
      </p>
      <div
        role="region"
        aria-label={`Changes to ${path}`}
        tabIndex={0}
        className="max-h-[28rem] overflow-auto rounded-lg bg-slate-900/5 py-2 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-teal-500 dark:bg-white/5"
      >
        {foldDiff(lines).map((line, i) =>
          line.type === 'fold' ? (
            <div
              key={i}
              className="px-3 italic text-slate-500 dark:text-slate-400"
            >
              … {line.count} unchanged line{line.count === 1 ? '' : 's'}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-words px-3',
                line.type === 'add' &&
                  'bg-teal-500/10 text-teal-900 dark:text-teal-100',
                line.type === 'del' &&
                  'bg-rose-500/10 text-rose-900 dark:text-rose-100',
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
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">
        {label}
      </p>
      <pre
        className={cn(
          'max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border-l-2 p-2 text-xs leading-relaxed',
          code ? 'font-mono' : 'font-sans',
          tone === 'before'
            ? 'border-rose-500 bg-rose-500/5'
            : 'border-teal-600 bg-teal-500/5',
        )}
      >
        {text}
      </pre>
    </div>
  )
}
