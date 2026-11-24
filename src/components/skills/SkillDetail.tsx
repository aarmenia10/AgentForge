import { Loader2, X } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AuthorLink, CopyButton, VERIFIED_AUTHOR_LABEL } from '@/components/ui'
import { Notice, smallButton, VisibilityLabel } from '@/components/studio/parts'
import { VoteButtons } from '@/components/ratings/VoteButtons'
import { CommentsSection } from '@/components/ratings/CommentsSection'
import { ReportDialog } from '@/components/ratings/ReportDialog'
import { fetchRatings, type RatingData } from '@/lib/blockedWords'
import { formatRelativeTime } from '@/lib/format'
import { InstallDialog } from '@/components/detail/InstallDialog'
import { skillInstallText } from '@/lib/installText'
import { formatBytes, skillBytes } from '@/lib/skillRepository'
import { SKILL_INSTRUCTIONS_PATH } from '@/lib/skillSchema'
import { publicOriginLabel } from '@/lib/portability'
import type {
  SkillFile,
  SkillFileSummary,
  SkillIndexEntry,
} from '@/types/skill'
import { FileText, KindLabel } from './parts'
import { comparePaths, loadPrompt } from './skillDraft'

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
  onClose,
  connectable = skill.visibility === 'public',
}: {
  skill: SkillIndexEntry
  /** Resolves to every file with its text. Called once, when shown. */
  loadFiles: () => Promise<SkillFile[]>
  heading?: Heading
  showAuthor?: boolean
  onClose?: () => void
  connectable?: boolean
}) {
  const { status, user } = useAuth()
  const uid = status === 'signed-in' && user ? user.uid : null
  const [files, setFiles] = useState<SkillFile[] | null>(null)
  const [error, setError] = useState(false)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [rating, setRating] = useState<RatingData | null>(null)
  const [showReport, setShowReport] = useState(false)
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

  useEffect(() => {
    let active = true
    fetchRatings('skill', skill.id)
      .then((r) => {
        if (active) setRating(r)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [skill.id])

  const instructions =
    files?.find((f) => f.path === SKILL_INSTRUCTIONS_PATH) ?? null
  const others = [...skill.files]
    .filter((f) => f.path !== SKILL_INSTRUCTIONS_PATH)
    .sort(comparePaths)
  const opened = openPath ? files?.find((f) => f.path === openPath) : null

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 whitespace-pre-wrap break-words text-base text-fg">
            {skill.description}
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-medium text-fg hover:bg-surface"
            >
              <X className="size-5" aria-hidden="true" />
              Close
            </button>
          )}
        </div>
        <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[7rem_1fr]">
          {showAuthor && (
            <Row term="Author">
              <span className="inline-flex flex-wrap items-center gap-2">
                <AuthorLink author={skill.author} showVerifiedLabel />
                <span className="text-fg-muted">{skill.author.name}</span>
              </span>
            </Row>
          )}
          <Row term="Version">
            <code className="font-mono">{skill.version}</code>
          </Row>
          <Row term="Who can see it">
            <VisibilityLabel visibility={skill.visibility} />
          </Row>
          <Row term="Ratings">
            <div className="flex items-center gap-3">
              <VoteButtons
                kind="skill"
                itemId={skill.id}
                initialThumbsUp={
                  rating?.thumbs_up ??
                  ((skill.stats as unknown as Record<string, unknown>)
                    .thumbs_up as number | undefined) ??
                  0
                }
                initialThumbsDown={
                  rating?.thumbs_down ??
                  ((skill.stats as unknown as Record<string, unknown>)
                    .thumbs_down as number | undefined) ??
                  0
                }
              />
              {uid && uid !== skill.author.uid && (
                <button
                  type="button"
                  onClick={() => setShowReport(true)}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:text-fg"
                >
                  Report
                </button>
              )}
            </div>
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
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs text-fg-muted"
                >
                  #{tag}
                </li>
              ))}
            </ul>
          </Row>
        </dl>
        {skill.author.verified && (
          <p className="text-xs text-fg-muted">
            {VERIFIED_AUTHOR_LABEL} means the registry confirmed who the author
            is. It is not a safety check or a review of the skill.
          </p>
        )}
        {isPublic && publicOriginLabel(skill.origin_app) && (
          <p className="text-xs text-fg-muted">
            {publicOriginLabel(skill.origin_app)}
          </p>
        )}
      </div>

      <section className="space-y-3">
        <InstallDialog
          kind="Skill"
          name={skill.name}
          directText={files && skillInstallText({ ...skill, files })}
          connectedText={connectable ? loadPrompt(skill) : undefined}
          restricted={!connectable}
          limitation="Text and reference files are included. Scripts and external tools require a compatible AI workspace and your approval."
        />
      </section>

      <details className="space-y-3">
        <summary className="cursor-pointer text-lg font-semibold">
          Advanced Options
        </summary>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <H className="text-lg font-semibold text-fg">
              Skill Instructions (SKILL.md)
            </H>
            {instructions && (
              <CopyButton
                text={instructions.content}
                label="Copy instruction file"
              />
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
            <FileText text={instructions.content} label="Skill Instructions" />
          ) : null}
        </section>

        <section className="space-y-3">
          <H className="text-lg font-semibold text-fg">Other files</H>
          {others.length === 0 ? (
            <p>This skill contains only its instruction file.</p>
          ) : (
            <>
              <p>The skill instructions explain when to read each file.</p>
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
      </details>

      <section className="space-y-3 border-t border-line pt-4">
        <H className="text-lg font-semibold text-fg">Comments</H>
        <CommentsSection
          kind="skill"
          itemId={skill.id}
          initialComments={rating?.comments ?? []}
          authorUid={skill.author.uid}
        />
      </section>

      {showReport && (
        <ReportDialog
          kind="skill"
          itemId={skill.id}
          targetType="item"
          targetId={skill.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-fg">{term}</dt>
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
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3">
      <span className="min-w-0 space-y-0.5">
        <code className="block break-all font-mono text-xs text-fg">
          {file.path}
        </code>
        <span className="flex flex-wrap items-center gap-x-3">
          <KindLabel kind={file.kind} />
          <span className="font-mono text-xs tabular-nums text-fg-muted">
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
