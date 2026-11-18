import { Loader2 } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  AuthorLink,
  CodeBlock,
  CopyButton,
  VERIFIED_AUTHOR_LABEL,
} from '@/components/ui'
import { Notice, smallButton, VisibilityLabel } from '@/components/studio/parts'
import { formatRelativeTime } from '@/lib/format'
import { MCP_CONNECTOR_URL } from '@/lib/mcpConfig'
import { formatBytes, skillBytes } from '@/lib/skillRepository'
import { SKILL_INSTRUCTIONS_PATH } from '@/lib/skillSchema'
import type {
  SkillFile,
  SkillFileSummary,
  SkillIndexEntry,
} from '@/types/skill'
import { FileText, KindLabel } from './parts'
import { comparePaths, FIND_PROMPT, loadPrompt } from './skillDraft'

type Heading = 'h2' | 'h4'

/**
 * One skill: what it is, who made it, its files, the SKILL.md text, and how
 * to use it. Works for a public index entry (files fetched once from the
 * version file) and for a full record from Firestore (files already here).
 */
export function SkillDetail({
  skill,
  loadFiles,
  heading = 'h2',
  showAuthor = true,
}: {
  skill: SkillIndexEntry
  /** Resolves to every file with its text. Called once, when shown. */
  loadFiles: () => Promise<SkillFile[]>
  heading?: Heading
  showAuthor?: boolean
}) {
  const [files, setFiles] = useState<SkillFile[] | null>(null)
  const [error, setError] = useState(false)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const H = heading
  const panel = useId()
  const isPublic = skill.visibility === 'public'

  useEffect(() => {
    let active = true
    loadFiles()
      .then((loaded) => active && setFiles(loaded))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
    // Loaded once per mounted skill; the caller keys this component.
  }, [])

  const instructions =
    files?.find((f) => f.path === SKILL_INSTRUCTIONS_PATH) ?? null
  const others = [...skill.files]
    .filter((f) => f.path !== SKILL_INSTRUCTIONS_PATH)
    .sort(comparePaths)
  const opened = openPath ? files?.find((f) => f.path === openPath) : null

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3">
        <p className="whitespace-pre-wrap break-words text-base text-slate-700 dark:text-slate-200">
          {skill.description}
        </p>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[7rem_1fr]">
          {showAuthor && (
            <Row term="Author">
              <span className="inline-flex flex-wrap items-center gap-2">
                <AuthorLink author={skill.author} showVerifiedLabel />
                <span className="text-slate-600 dark:text-slate-400">
                  {skill.author.name}
                </span>
              </span>
            </Row>
          )}
          <Row term="Version">
            <code className="font-mono">{skill.version}</code>
          </Row>
          <Row term="Who can see it">
            <VisibilityLabel visibility={skill.visibility} />
          </Row>
          <Row term="Updated">{formatRelativeTime(skill.stats.updated_at)}</Row>
          <Row term="Size">
            {formatBytes(skillBytes(skill.files))} in {skill.files.length}{' '}
            {skill.files.length === 1 ? 'file' : 'files'}
          </Row>
          <Row term="Tags">
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {skill.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md bg-slate-900/5 px-2 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          </Row>
        </dl>
        {skill.author.verified && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {VERIFIED_AUTHOR_LABEL} means the registry confirmed who the author
            is. It is not a safety check or a review of the skill.
          </p>
        )}
      </div>

      <section className="space-y-3">
        <H className="text-lg font-semibold text-slate-900 dark:text-white">
          Use it from an AI app
        </H>
        {isPublic ? (
          <>
            <p>
              Add AgentLemon to your AI app once, as a connector. Then ask for
              this skill by name:
            </p>
            <CodeBlock
              code={loadPrompt(skill)}
              title="Say this in your AI app"
              copyLabel="Copy"
            />
            <p>
              Or describe the job and let it compare skills:{' '}
              <span className="font-mono text-[13px] text-slate-800 dark:text-slate-100">
                {FIND_PROMPT}
              </span>
            </p>
            <CodeBlock
              code={MCP_CONNECTOR_URL}
              title="Connector link"
              copyLabel="Copy link"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400">
              In your AI app&apos;s settings, add a custom connector and paste
              the link. Apps without a skills feature can still follow a skill,
              because it is plain text.
            </p>
          </>
        ) : (
          <p>
            For now, private and friends skills are used from this website: copy
            SKILL.md below and paste it into your AI app. Connected apps will
            reach them once connector sign-in arrives.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <H className="text-lg font-semibold text-slate-900 dark:text-white">
            SKILL.md
          </H>
          {instructions && (
            <CopyButton text={instructions.content} label="Copy SKILL.md" />
          )}
        </div>
        {error ? (
          <Notice tone="error" role="alert">
            Could not load this skill&apos;s files. Reload the page to try
            again.
          </Notice>
        ) : !files ? (
          <p className="inline-flex items-center gap-2" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the files…
          </p>
        ) : instructions ? (
          <FileText text={instructions.content} label="Text of SKILL.md" />
        ) : null}
      </section>

      <section className="space-y-3">
        <H className="text-lg font-semibold text-slate-900 dark:text-white">
          Other files
        </H>
        {others.length === 0 ? (
          <p>This skill is a single SKILL.md file.</p>
        ) : (
          <>
            <p>SKILL.md says when to read each one. Open them one at a time.</p>
            <ul className="space-y-2" aria-label="Other files">
              {others.map((f) => (
                <FileLine
                  key={f.path}
                  file={f}
                  open={openPath === f.path}
                  disabled={!files}
                  panel={panel}
                  onToggle={() =>
                    setOpenPath(openPath === f.path ? null : f.path)
                  }
                />
              ))}
            </ul>
            {opened && (
              <div id={panel} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="break-all font-mono text-xs font-semibold">
                    {opened.path}
                  </code>
                  <CopyButton text={opened.content} label="Copy this file" />
                </div>
                <FileText
                  text={opened.content}
                  label={`Text of ${opened.path}`}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-slate-800 dark:text-slate-100">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

function FileLine({
  file,
  open,
  disabled,
  panel,
  onToggle,
}: {
  file: SkillFileSummary
  open: boolean
  disabled: boolean
  panel: string
  onToggle: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900/5 px-3 py-2 dark:bg-white/5">
      <span className="min-w-0 space-y-0.5">
        <code className="block break-all font-mono text-xs text-slate-900 dark:text-white">
          {file.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3">
          <KindLabel kind={file.kind} />
          <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
            {formatBytes(file.bytes)}
          </span>
        </span>
      </span>
      <button
        type="button"
        className={smallButton}
        aria-expanded={open}
        aria-controls={open ? panel : undefined}
        disabled={disabled}
        onClick={onToggle}
      >
        {open ? 'Close' : 'Open'}
        <span className="sr-only"> {file.path}</span>
      </button>
    </li>
  )
}
