/**
 * Pure logic for the skill upload and review screens (P3-10). No React and no
 * DOM, so tests import it directly. Every rule comes from src/lib/skillSchema.ts
 * and lintSkill; this file only arranges their results for the screens.
 * docs/SKILLS.md section 10.
 */
import { lintSkill, type LintFinding } from '@/lib/safetyLinter'
import {
  checkSkillFiles,
  classifySkillFile,
  decodeSkillFile,
  isIgnoredUploadPath,
  parseSkillFrontmatter,
  skillManifestSchema,
  SKILL_INSTRUCTIONS_PATH,
  SKILL_MAX_FILE_BYTES,
  SKILL_MAX_FILES,
  SKILL_MAX_TAGS,
  stripCommonRoot,
  utf8ByteLength,
  type SkillIssue,
} from '@/lib/skillSchema'
import {
  isHigherVersion,
  nextPatch,
  normalizeTag,
  type Identity,
} from '@/lib/studioManifest'
import {
  SKILL_SCHEMA_VERSION,
  type SkillFile,
  type SkillIndexEntry,
  type SkillManifest,
  type SkillRecord,
  type SkillVisibility,
} from '@/types/skill'

/* ---------- Reading an upload ---------- */

/** One file from a picker or a drop, before it is read. */
export interface UploadEntry {
  /** Path as the browser reports it, e.g. `pdf-forms/references/a.md`. */
  path: string
  size: number
  read: () => Promise<Uint8Array>
}

export interface RejectedFile {
  path: string
  reason: string
}

export interface UploadResult {
  files: SkillFile[]
  rejected: RejectedFile[]
  /** Paths left out on purpose (.DS_Store, .git/, node_modules/, ...). */
  skipped: string[]
  /** Set when nothing was read because the upload breaks a whole-skill rule. */
  refused: string | null
}

export const ARCHIVE_MESSAGE = 'Unzip it and choose the folder instead.'

const ARCHIVE = /\.(zip|skill)$/i

export function isArchivePath(path: string): boolean {
  return ARCHIVE.test(path)
}

/**
 * The upload pipeline of docs/SKILLS.md section 10, steps 1 to 4: skip
 * ignored paths, refuse archives, strip the shared folder, refuse more than
 * 50 files before reading any, then decode and classify each file.
 */
export async function readUpload(
  entries: readonly UploadEntry[],
): Promise<UploadResult> {
  const skipped: string[] = []
  const rejected: RejectedFile[] = []
  const kept: UploadEntry[] = []
  for (const entry of entries) {
    const path = entry.path.replaceAll('\\', '/').replace(/^\/+/, '')
    if (isIgnoredUploadPath(path)) skipped.push(path)
    else if (isArchivePath(path))
      rejected.push({ path, reason: ARCHIVE_MESSAGE })
    else kept.push({ ...entry, path })
  }
  const empty = (refused: string | null): UploadResult => ({
    files: [],
    rejected,
    skipped,
    refused,
  })
  if (kept.length === 0)
    return empty(
      rejected.length && rejected.every((r) => r.reason === ARCHIVE_MESSAGE)
        ? `Archives are not accepted. ${ARCHIVE_MESSAGE}`
        : null,
    )
  if (kept.length > SKILL_MAX_FILES)
    return empty(
      `That is ${kept.length} files. A skill holds at most ${SKILL_MAX_FILES}, SKILL.md included. Nothing was read.`,
    )

  const paths = stripCommonRoot(kept.map((e) => e.path))
  const files: SkillFile[] = []
  for (let i = 0; i < kept.length; i++) {
    const path = paths[i]
    if (kept[i].size > SKILL_MAX_FILE_BYTES) {
      rejected.push({
        path,
        reason: `File is larger than ${SKILL_MAX_FILE_BYTES / 1024} KB`,
      })
      continue
    }
    let bytes: Uint8Array
    try {
      bytes = await kept[i].read()
    } catch {
      rejected.push({ path, reason: 'Could not read this file' })
      continue
    }
    const decoded = decodeSkillFile(path, bytes)
    if (!decoded.ok) {
      rejected.push({ path, reason: decoded.reason })
      continue
    }
    // TextDecoder already drops a leading byte-order mark; this covers text
    // that reaches here some other way.
    const content = decoded.content.replace(/^\uFEFF/, '')
    files.push({ path, kind: classifySkillFile(path, content), content })
  }
  files.sort(comparePaths)
  return { files, rejected, skipped, refused: null }
}

/** SKILL.md first, then folders after top-level files, then by name. */
export function comparePaths(a: { path: string }, b: { path: string }): number {
  if (a.path === SKILL_INSTRUCTIONS_PATH) return -1
  if (b.path === SKILL_INSTRUCTIONS_PATH) return 1
  const da = a.path.split('/').length
  const db = b.path.split('/').length
  if (da > 1 !== db > 1) return da > 1 ? 1 : -1
  return a.path.localeCompare(b.path)
}

/* ---------- The draft ---------- */

export const SKILL_TEMPLATE = `---
name: my-skill
description: What this skill does, and when an AI should use it.
---

# My skill

Write the steps an AI should follow, in order.

1. First step.
2. Second step.
`

export type DraftSource = 'files' | 'text'

export interface SkillDraft {
  source: DraftSource
  /** Files from a picker or a drop (source `files`). */
  files: SkillFile[]
  /** The SKILL.md text box (source `text`). */
  text: string
  id: string
  /** False until the author types an id; until then it follows the name. */
  idTouched: boolean
  version: string
  tags: string
  visibility: SkillVisibility
}

export function emptySkillDraft(): SkillDraft {
  return {
    source: 'files',
    files: [],
    text: SKILL_TEMPLATE,
    id: '',
    idTouched: false,
    version: '1.0.0',
    tags: '',
    visibility: 'private',
  }
}

/** The files the draft would save, whichever input is in use. */
export function draftFiles(draft: SkillDraft): SkillFile[] {
  if (draft.source === 'text')
    return [
      {
        path: SKILL_INSTRUCTIONS_PATH,
        kind: classifySkillFile(SKILL_INSTRUCTIONS_PATH, draft.text),
        content: draft.text,
      },
    ]
  return draft.files
}

export function draftFromRecord(record: SkillManifest): SkillDraft {
  const files = [...record.files].sort(comparePaths)
  const textOnly =
    files.length === 1 && files[0].path === SKILL_INSTRUCTIONS_PATH
  return {
    source: textOnly ? 'text' : 'files',
    files: textOnly ? [] : files,
    text: textOnly ? files[0].content : SKILL_TEMPLATE,
    id: record.id,
    idTouched: true,
    version: record.version,
    tags: record.tags.join(', '),
    visibility: record.visibility,
  }
}

export function parseTags(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const tag = normalizeTag(raw)
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out
}

export function frontmatterOf(
  files: readonly SkillFile[],
): { name: string; description: string } | null {
  const instructions = files.find((f) => f.path === SKILL_INSTRUCTIONS_PATH)
  if (!instructions) return null
  const parsed = parseSkillFrontmatter(instructions.content)
  return parsed.ok ? parsed.value : null
}

/** The id the form uses: what the author typed, or the SKILL.md name. */
export function effectiveId(draft: SkillDraft): string {
  if (draft.idTouched) return draft.id.trim()
  return frontmatterOf(draftFiles(draft))?.name ?? ''
}

export function draftToManifest(
  draft: SkillDraft,
  identity: Identity,
  now = new Date(),
): SkillManifest {
  const files = draftFiles(draft)
  const front = frontmatterOf(files)
  return {
    skill_schema_version: SKILL_SCHEMA_VERSION,
    visibility: draft.visibility,
    id: effectiveId(draft),
    version: draft.version.trim(),
    name: front?.name ?? '',
    description: front?.description ?? '',
    author: {
      uid: identity.uid,
      name: identity.name,
      handle: identity.handle,
      verified: false,
    },
    tags: parseTags(draft.tags),
    files,
    stats: { updated_at: now.toISOString() },
  }
}

/* ---------- Checks ---------- */

export interface Problem {
  /** `id`, `version`, `tags`, `name`, `description`, `files`, or a file path key. */
  field: string
  message: string
}

export interface FileNotes {
  problems: string[]
  findings: LintFinding[]
}

export interface DraftCheck {
  manifest: SkillManifest
  /** Problems with the form fields and the skill as a whole. */
  problems: Problem[]
  /** Validation problems and linter findings for each file, by path. */
  byFile: Map<string, FileNotes>
  /** Findings that are not about one file (name, description, tags). */
  otherFindings: LintFinding[]
  findings: LintFinding[]
  scripts: string[]
  blocked: boolean
  totalBytes: number
  /** Count of problems that stop any save, the files' included. */
  problemCount: number
}

const FIELD_HELP: Record<string, string> = {
  id: 'Use lowercase letters, digits, and single hyphens, like pdf-forms.',
  version: 'Use a version number like 1.0.0.',
  tags: `Add 1 to ${SKILL_MAX_TAGS} tags, separated by commas.`,
  name: 'The name in SKILL.md must be lowercase letters, digits, and single hyphens, at most 64 characters. Change it in the file.',
  description:
    'The description in SKILL.md must not be blank and must be at most 1,024 characters. Change it in the file.',
}

export const fileKey = (path: string) => `files[${JSON.stringify(path)}]`

function belongsTo(path: string, key: string): boolean {
  return (
    path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`)
  )
}

export interface CheckContext {
  /** Ids in the public skills file, checked on create only. */
  takenIds?: ReadonlySet<string> | null
  /** The live record when editing. */
  live?: SkillRecord | null
}

export function checkDraft(
  draft: SkillDraft,
  identity: Identity,
  context: CheckContext = {},
): DraftCheck {
  const manifest = draftToManifest(draft, identity)
  const problems: Problem[] = []
  const byFile = new Map<string, FileNotes>()
  for (const file of manifest.files)
    byFile.set(file.path, { problems: [], findings: [] })
  const add = (field: string, message: string) => {
    if (!problems.some((p) => p.field === field && p.message === message))
      problems.push({ field, message })
  }

  if (manifest.files.length === 0)
    add('files', 'Add your skill: choose its folder, or write SKILL.md here.')

  // Shape: fields the author fills in, and the two read from SKILL.md.
  const front = frontmatterOf(manifest.files)
  const parsed = skillManifestSchema.safeParse(manifest)
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? '')
      if (field === 'files') continue
      if ((field === 'name' || field === 'description') && !front) continue
      if (FIELD_HELP[field]) add(field, FIELD_HELP[field])
    }
  if (manifest.id === 'new')
    add('id', '"new" is the address of this page. Choose another id.')
  else if (!context.live && context.takenIds?.has(manifest.id))
    add('id', 'A public skill already uses this id. Choose another one.')

  const live = context.live
  if (
    live &&
    live.visibility === 'public' &&
    live.review_status === 'approved' &&
    !isHigherVersion(manifest.version, live.version)
  )
    add(
      'version',
      `Use a version higher than ${live.version}, the one that is live now. The next patch number is ${nextPatch(live.version)}.`,
    )

  // Content rules. A script in a shared skill is reported by the linter as a
  // Blocked finding beside the file, so its validator twin is not repeated.
  let lint: LintFinding[]
  try {
    lint = lintSkill(manifest).findings
  } catch {
    lint = []
  }
  const issues: SkillIssue[] = checkSkillFiles(manifest)
  for (const issue of issues) {
    const file = manifest.files.find((f) =>
      belongsTo(issue.path, fileKey(f.path)),
    )
    if (file) {
      if (
        issue.code === 'script_not_allowed' &&
        lint.some(
          (f) => f.rule === 'SK-01' && belongsTo(f.path, fileKey(file.path)),
        )
      )
        continue
      byFile.get(file.path)?.problems.push(issue.message)
    } else if (
      issue.code === 'name_mismatch' ||
      issue.code === 'description_mismatch'
    ) {
      // Cannot happen: the form copies both from SKILL.md.
      continue
    } else add('files', issue.message)
  }

  const otherFindings: LintFinding[] = []
  for (const finding of lint) {
    const file = manifest.files.find((f) =>
      belongsTo(finding.path, fileKey(f.path)),
    )
    if (file) byFile.get(file.path)?.findings.push(finding)
    else otherFindings.push(finding)
  }

  const scripts = manifest.files
    .filter((f) => f.kind === 'script')
    .map((f) => f.path)
  const blocked = lint.some((f) => f.severity === 'block') || scripts.length > 0
  let fileProblems = 0
  for (const notes of byFile.values()) fileProblems += notes.problems.length
  return {
    manifest,
    problems,
    byFile,
    otherFindings,
    findings: lint,
    scripts,
    blocked,
    totalBytes: manifest.files.reduce(
      (sum, f) => sum + utf8ByteLength(f.content),
      0,
    ),
    problemCount: problems.length + fileProblems,
  }
}

/** Whether the save button may be pressed for this visibility. */
export function canSave(check: DraftCheck): boolean {
  if (check.problemCount > 0) return false
  return check.manifest.visibility === 'private' || !check.blocked
}

export function saveLabel(
  visibility: SkillVisibility,
  live: SkillRecord | null,
): string {
  if (visibility === 'private') return 'Save privately'
  if (visibility === 'friends') return 'Save and share with friends'
  if (live?.visibility === 'public' && live.review_status === 'approved')
    return 'Submit the edit for review'
  return 'Submit for public review'
}

export function savedMessage(
  visibility: SkillVisibility,
  staged: boolean,
  live: SkillRecord | null,
): string {
  if (staged)
    return `Your edit is waiting for review. Version ${live?.version ?? ''} stays live until a reviewer approves the new one, which then appears within about an hour.`
  const wasLive =
    live?.visibility === 'public' && live.review_status === 'approved'
  if (visibility === 'private')
    return wasLive
      ? 'Saved as private. It leaves the public skills list on the next refresh, within about an hour.'
      : 'Saved. Only you can see it.'
  if (visibility === 'friends')
    return wasLive
      ? 'Saved for friends. It leaves the public skills list on the next refresh, within about an hour.'
      : 'Saved. Your friends can see it now.'
  return 'Submitted for review. A person reviews it first; once approved, it appears on the skills page within about an hour.'
}

/* ---------- Comparing a waiting edit with the live version ---------- */

export interface MetaChange {
  label: string
  before: string
  after: string
}

export type FileChangeStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface FileChange {
  path: string
  status: FileChangeStatus
  before: SkillFile | null
  after: SkillFile | null
}

export function compareSkills(
  live: SkillManifest,
  edit: SkillManifest,
): { meta: MetaChange[]; files: FileChange[] } {
  const meta: MetaChange[] = [
    { label: 'Version', before: live.version, after: edit.version },
    { label: 'Name', before: live.name, after: edit.name },
    { label: 'Description', before: live.description, after: edit.description },
    {
      label: 'Tags',
      before: live.tags.join(', '),
      after: edit.tags.join(', '),
    },
    { label: 'Visibility', before: live.visibility, after: edit.visibility },
  ].filter((row) => row.before !== row.after)

  const before = new Map(live.files.map((f) => [f.path, f]))
  const after = new Map(edit.files.map((f) => [f.path, f]))
  const paths = [...new Set([...before.keys(), ...after.keys()])]
  const files: FileChange[] = paths.map((path) => {
    const b = before.get(path) ?? null
    const a = after.get(path) ?? null
    const status: FileChangeStatus = !b
      ? 'added'
      : !a
        ? 'removed'
        : b.content === a.content && b.kind === a.kind
          ? 'unchanged'
          : 'changed'
    return { path, status, before: b, after: a }
  })
  const order: Record<FileChangeStatus, number> = {
    changed: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  }
  files.sort((x, y) => order[x.status] - order[y.status] || comparePaths(x, y))
  return { meta, files }
}

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

/** Above this many line pairs, a changed file is shown side by side instead. */
export const LINE_DIFF_LIMIT = 2_000_000

/**
 * Line diff by longest common subsequence. Returns null when the files are
 * too long to compare line by line in the browser.
 */
export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split('\n')
  const b = after.split('\n')
  // Trim the shared start and end so the table only covers the changed middle.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const n = endA - start
  const m = endB - start
  if (n * m > LINE_DIFF_LIMIT) return null
  const table = new Int32Array((n + 1) * (m + 1))
  const at = (i: number, j: number) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[at(i, j)] =
        a[start + i] === b[start + j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)])
  const out: DiffLine[] = a
    .slice(0, start)
    .map((text) => ({ type: 'same' as const, text }))
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      out.push({ type: 'same', text: a[start + i] })
      i++
      j++
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      out.push({ type: 'del', text: a[start + i++] })
    } else out.push({ type: 'add', text: b[start + j++] })
  }
  while (i < n) out.push({ type: 'del', text: a[start + i++] })
  while (j < m) out.push({ type: 'add', text: b[start + j++] })
  for (const text of a.slice(endA)) out.push({ type: 'same', text })
  return out
}

/** Collapses long unchanged runs to `context` lines on each side of a change. */
export function foldDiff(
  lines: readonly DiffLine[],
  context = 3,
): (DiffLine | { type: 'fold'; count: number })[] {
  const keep = lines.map(() => false)
  lines.forEach((line, index) => {
    if (line.type === 'same') return
    for (
      let k = Math.max(0, index - context);
      k <= Math.min(lines.length - 1, index + context);
      k++
    )
      keep[k] = true
  })
  const out: (DiffLine | { type: 'fold'; count: number })[] = []
  let hidden = 0
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden) out.push({ type: 'fold', count: hidden })
      hidden = 0
      out.push(line)
    } else hidden++
  })
  if (hidden) out.push({ type: 'fold', count: hidden })
  return out
}

/** What to type in a connected AI app to load this exact skill. */
export function loadPrompt(skill: { id: string; version: string }): string {
  return `Use AgentLemon to load the skill ${skill.id}@${skill.version}`
}

/** The general form, for finding a skill without knowing its id. */
export const FIND_PROMPT = 'Use AgentLemon to find a skill for ...'

/** A full manifest in the shape of a public index entry, for the detail view. */
export function toIndexEntry(skill: SkillManifest): SkillIndexEntry {
  return {
    skill_schema_version: skill.skill_schema_version,
    visibility: skill.visibility,
    id: skill.id,
    version: skill.version,
    name: skill.name,
    description: skill.description,
    author: skill.author,
    tags: skill.tags,
    stats: skill.stats,
    files: skill.files.map((f) => ({
      path: f.path,
      kind: f.kind,
      bytes: utf8ByteLength(f.content),
    })),
  }
}
