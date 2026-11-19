/**
 * Skill validator (P3-8). Specification: docs/SKILLS.md.
 *
 * This module imports nothing but zod, the shared id/version/handle schemas,
 * and types, so the site, the exporter, the local server, and the remote
 * connector's Worker all run identical checks. Keep it free of Node APIs and
 * Ajv: Workers forbid runtime code generation. TextDecoder is a web standard
 * present in browsers, Workers, and Node.
 */
import { z } from 'zod'
import {
  agentIdSchema,
  authorHandleSchema,
  versionSchema,
} from './manifestSchema'
import {
  SKILL_SCHEMA_VERSION,
  type ItemKind,
  type ItemRef,
  type SkillFile,
  type SkillFileKind,
  type SkillIndex,
  type SkillManifest,
  type SkillRecord,
  type SkillVisibility,
} from '../types/skill'

/* ---------- Limits (docs/SKILLS.md section 4) ---------- */

export const SKILL_INSTRUCTIONS_PATH = 'SKILL.md'
export const SKILL_MAX_FILES = 50
export const SKILL_MAX_FILE_BYTES = 100 * 1024
export const SKILL_MAX_TOTAL_BYTES = 200 * 1024
export const SKILL_MAX_PATH_LENGTH = 160
export const SKILL_MAX_PATH_DEPTH = 6
export const SKILL_MAX_TAGS = 10
/** SKILL.md frontmatter limits, matching the Agent Skills format. */
export const SKILL_NAME_MAX = 64
export const SKILL_DESCRIPTION_MAX = 1024

/** Text reference types, by lowercase extension. Everything else is a script. */
export const SKILL_REFERENCE_EXTENSIONS: readonly string[] = [
  'md',
  'markdown',
  'txt',
  'text',
  'rst',
  'adoc',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'xml',
  'ini',
]

/** Extensionless file names that are plain text by convention. */
export const SKILL_REFERENCE_NAMES: readonly string[] = [
  'LICENSE',
  'LICENCE',
  'NOTICE',
  'COPYING',
  'README',
  'CHANGELOG',
  'AUTHORS',
]

/** Rejected outright with a clear message, before any decoding. */
export const SKILL_BINARY_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'tif',
  'tiff',
  'heic',
  'pdf',
  'zip',
  'skill',
  'gz',
  'tgz',
  'tar',
  'bz2',
  'xz',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'class',
  'jar',
  'wasm',
  'pyc',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'mp3',
  'mp4',
  'wav',
  'mov',
  'webm',
  'docx',
  'xlsx',
  'pptx',
  'sqlite',
  'db',
]

/* ---------- Small pure helpers ---------- */

/** UTF-8 byte length without allocating, matching Firestore's string size. */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i++
      } else bytes += 3
    } else bytes += 3
  }
  return bytes
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

function extensionOf(path: string): string | undefined {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : undefined
}

const segmentPattern = /^[A-Za-z0-9_](?:[A-Za-z0-9._ -]*[A-Za-z0-9._-])?$/

/**
 * Path rules (docs/SKILLS.md 3.2). Returns a plain-English problem, or null
 * when the path is acceptable.
 */
export function checkSkillPath(path: string): string | null {
  if (path.length === 0) return 'Path is empty'
  if (path.length > SKILL_MAX_PATH_LENGTH)
    return `Path is longer than ${SKILL_MAX_PATH_LENGTH} characters`
  if (path.includes('\\')) return 'Use / between folders, not \\'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
    return 'Path must be relative to the skill folder, not absolute'
  const segments = path.split('/')
  if (segments.some((s) => s === '..'))
    return 'Path must not contain ".." (it would leave the skill folder)'
  if (segments.some((s) => s === '.' || s === ''))
    return 'Path must not contain "." or empty folder names'
  if (segments.length > SKILL_MAX_PATH_DEPTH)
    return `Path is nested deeper than ${SKILL_MAX_PATH_DEPTH} levels`
  for (const segment of segments) {
    if (segment.startsWith('.'))
      return 'Hidden files and folders (names starting with ".") are not allowed'
    if (!segmentPattern.test(segment))
      return 'Use only letters, digits, spaces, ".", "_", and "-" in names'
  }
  return null
}

/** True when the path or content shows the file is binary (docs/SKILLS.md 3.1). */
export function isBinarySkillFile(path: string, content: string): boolean {
  const ext = extensionOf(path)
  return (
    (ext !== undefined && SKILL_BINARY_EXTENSIONS.includes(ext)) ||
    content.includes('\u0000')
  )
}

/**
 * Derives a file's kind (docs/SKILLS.md 3.1). Callers reject binary files
 * first with isBinarySkillFile.
 */
export function classifySkillFile(
  path: string,
  content: string,
): SkillFileKind {
  if (content.startsWith('#!')) return 'script'
  if (path === SKILL_INSTRUCTIONS_PATH) return 'instructions'
  const ext = extensionOf(path)
  if (ext !== undefined)
    return SKILL_REFERENCE_EXTENSIONS.includes(ext) ? 'reference' : 'script'
  return SKILL_REFERENCE_NAMES.includes(baseName(path)) ? 'reference' : 'script'
}

/**
 * Turns raw bytes from the browser's file picker into skill text. Rejects
 * anything that is not valid UTF-8 or that contains NUL, and drops a leading
 * byte-order mark (which SL-07 would otherwise block).
 */
export function decodeSkillFile(
  path: string,
  bytes: Uint8Array,
): { ok: true; content: string } | { ok: false; reason: string } {
  const ext = extensionOf(path)
  if (ext !== undefined && SKILL_BINARY_EXTENSIONS.includes(ext))
    return {
      ok: false,
      reason:
        ext === 'zip' || ext === 'skill'
          ? 'Archives are not accepted. Unzip it and choose the folder instead'
          : 'Binary files such as images, PDFs, and fonts are not accepted',
    }
  if (bytes.byteLength > SKILL_MAX_FILE_BYTES)
    return {
      ok: false,
      reason: `File is larger than ${SKILL_MAX_FILE_BYTES / 1024} KB`,
    }
  let content: string
  try {
    content = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes)
  } catch {
    return { ok: false, reason: 'File is not UTF-8 text' }
  }
  if (content.includes('\u0000'))
    return { ok: false, reason: 'File is binary (it contains NUL bytes)' }
  return { ok: true, content }
}

/** Uploads silently skip these; the upload screen lists what it skipped. */
export function isIgnoredUploadPath(path: string): boolean {
  return path
    .split('/')
    .some(
      (s) =>
        s.startsWith('.') ||
        s === '__pycache__' ||
        s === 'node_modules' ||
        s === 'Thumbs.db' ||
        s === 'desktop.ini',
    )
}

/**
 * A folder picker reports `my-skill/SKILL.md`. Strips that shared first
 * folder when every path sits inside it, so SKILL.md lands at the root.
 */
export function stripCommonRoot(paths: readonly string[]): string[] {
  if (paths.length === 0) return []
  const first = paths[0].split('/')[0]
  const shared = paths.every(
    (p) => p.includes('/') && p.split('/')[0] === first,
  )
  return shared ? paths.map((p) => p.slice(first.length + 1)) : [...paths]
}

/* ---------- SKILL.md frontmatter ---------- */

export interface SkillFrontmatter {
  name: string
  description: string
}

function unquote(raw: string): string | null {
  const value = raw.trim()
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) return null
    return value
      .slice(1, -1)
      .replace(/\\(["\\nt])/g, (_, c: string) =>
        c === 'n' ? '\n' : c === 't' ? '\t' : c,
      )
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) return null
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value.replace(/\s+#.*$/, '')
}

/**
 * Reads `name` and `description` from the YAML frontmatter that opens
 * SKILL.md. Supports the forms skills use in practice: plain, single- or
 * double-quoted, folded (`>`) and literal (`|`) block scalars, and plain
 * values continued on indented lines. Other keys are ignored. Returns an
 * error string when the frontmatter is missing, malformed, or repeats a key.
 */
export function parseSkillFrontmatter(
  text: string,
): { ok: true; value: SkillFrontmatter } | { ok: false; error: string } {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---')
    return { ok: false, error: 'SKILL.md must start with a --- line' }
  const end = lines.indexOf('---', 1)
  if (end < 0)
    return { ok: false, error: 'SKILL.md frontmatter has no closing --- line' }
  const found: Partial<Record<'name' | 'description', string>> = {}
  for (let i = 1; i < end; i++) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+):(.*)$/)
    if (!match) continue
    const key = match[1]
    if (key !== 'name' && key !== 'description') continue
    if (found[key] !== undefined)
      return { ok: false, error: `SKILL.md frontmatter repeats "${key}"` }
    const raw = match[2].trim()
    const block: string[] = []
    while (i + 1 < end && /^(\s|$)/.test(lines[i + 1])) block.push(lines[++i])
    let value: string | null
    const blockMatch = raw.match(/^([|>])[-+]?$/)
    if (blockMatch) {
      const body = block.map((l) => l.trim())
      while (body.length && body[body.length - 1] === '') body.pop()
      value =
        blockMatch[1] === '|'
          ? body.join('\n')
          : body.join(' ').replace(/ +/g, ' ')
    } else if (block.length && !/^["']/.test(raw)) {
      value = [raw, ...block.map((l) => l.trim())]
        .filter((part) => part !== '')
        .join(' ')
    } else {
      value = unquote(raw)
    }
    if (value === null)
      return { ok: false, error: `SKILL.md frontmatter "${key}" is malformed` }
    found[key] = value.trim()
  }
  if (!found.name)
    return { ok: false, error: 'SKILL.md frontmatter has no "name"' }
  if (!found.description)
    return { ok: false, error: 'SKILL.md frontmatter has no "description"' }
  return {
    ok: true,
    value: { name: found.name, description: found.description },
  }
}

/* ---------- Shapes ---------- */

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, 'Text must not be blank')

const visibilitySchema = z.enum(['public', 'friends', 'private'])
const fileKindSchema = z.enum(['instructions', 'reference', 'script'])

/**
 * `strict` rejects unknown keys (writes, Firestore records). Readers of
 * public files use the loose form so a later additive field never breaks a
 * released server, the trap `catalog.json` fell into.
 */
function shapes(strict: boolean) {
  const obj = strict ? z.strictObject : z.object
  const author = obj({
    uid: text,
    name: text,
    handle: authorHandleSchema,
    verified: z.boolean(),
  })
  const stats = obj({ updated_at: z.iso.datetime({ offset: true }) })
  const tags = z
    .array(agentIdSchema)
    .min(1)
    .max(SKILL_MAX_TAGS)
    .refine((v) => new Set(v).size === v.length, 'Duplicate tags')
  const base = {
    skill_schema_version: z.literal(SKILL_SCHEMA_VERSION),
    visibility: visibilitySchema,
    id: agentIdSchema,
    version: versionSchema,
    name: agentIdSchema.max(SKILL_NAME_MAX),
    description: text.max(SKILL_DESCRIPTION_MAX),
    author,
    tags,
    stats,
    origin_app: z.enum(['claude', 'chatgpt', 'other']).optional(),
  }
  const manifest = obj({
    ...base,
    files: z
      .array(
        obj({ path: z.string(), kind: fileKindSchema, content: z.string() }),
      )
      .min(1),
  })
  const record = obj({
    ...manifest.shape,
    owner_uid: text,
    review_status: z.enum(['pending', 'approved', 'rejected']),
  })
  const indexEntry = obj({
    ...base,
    files: z
      .array(
        obj({
          path: z.string(),
          kind: fileKindSchema,
          bytes: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  })
  return { manifest, record, indexEntry }
}

const strictShapes = shapes(true)
const looseShapes = shapes(false)

export const skillManifestSchema = strictShapes.manifest
export const skillRecordSchema = strictShapes.record

/* ---------- Validation ---------- */

export type SkillIssueCode =
  | 'shape'
  | 'too_many_files'
  | 'path_invalid'
  | 'path_duplicate'
  | 'binary_file'
  | 'kind_mismatch'
  | 'file_too_large'
  | 'skill_too_large'
  | 'missing_instructions'
  | 'frontmatter'
  | 'name_mismatch'
  | 'description_mismatch'
  | 'script_not_allowed'

export interface SkillIssue {
  code: SkillIssueCode
  /** Field path, e.g. `files["scripts/run.py"].kind` or `name`. */
  path: string
  message: string
}

export type SkillValidation<T> =
  { ok: true; value: T; issues: [] } | { ok: false; issues: SkillIssue[] }

const filePath = (path: string) => `files[${JSON.stringify(path)}]`

/**
 * Content rules shared by every entry point: count, paths, binary, kind,
 * sizes, SKILL.md and its frontmatter, and the script rule per visibility.
 */
export function checkSkillFiles(skill: {
  visibility: SkillVisibility
  name: string
  description: string
  files: readonly SkillFile[]
}): SkillIssue[] {
  const issues: SkillIssue[] = []
  const add = (code: SkillIssueCode, path: string, message: string) =>
    issues.push({ code, path, message })

  if (skill.files.length > SKILL_MAX_FILES)
    add(
      'too_many_files',
      'files',
      `A skill holds at most ${SKILL_MAX_FILES} files; this one has ${skill.files.length}`,
    )

  const seen = new Set<string>()
  let total = 0
  for (const file of skill.files) {
    const at = filePath(file.path)
    const pathProblem = checkSkillPath(file.path)
    if (pathProblem) add('path_invalid', `${at}.path`, pathProblem)
    const folded = file.path.toLowerCase()
    if (seen.has(folded))
      add(
        'path_duplicate',
        `${at}.path`,
        'Two files share this path (names are compared ignoring case)',
      )
    seen.add(folded)

    const bytes = utf8ByteLength(file.content)
    total += bytes
    if (bytes > SKILL_MAX_FILE_BYTES)
      add(
        'file_too_large',
        `${at}.content`,
        `File is ${bytes} bytes; the limit is ${SKILL_MAX_FILE_BYTES}`,
      )

    if (isBinarySkillFile(file.path, file.content)) {
      add('binary_file', at, 'Binary files are not accepted; skills are text')
      continue
    }
    const derived = classifySkillFile(file.path, file.content)
    if (derived !== file.kind)
      add(
        'kind_mismatch',
        `${at}.kind`,
        `Stored kind "${file.kind}" does not match "${derived}" derived from the file`,
      )
    if (derived === 'script' && skill.visibility !== 'private')
      add(
        'script_not_allowed',
        at,
        'Scripts are allowed only in private skills. Remove this file or make the skill private',
      )
  }
  if (total > SKILL_MAX_TOTAL_BYTES)
    add(
      'skill_too_large',
      'files',
      `Skill is ${total} bytes in all; the limit is ${SKILL_MAX_TOTAL_BYTES}`,
    )

  const instructions = skill.files.find(
    (f) => f.path === SKILL_INSTRUCTIONS_PATH,
  )
  if (!instructions) {
    const nearMiss = skill.files.find(
      (f) => f.path.toLowerCase() === SKILL_INSTRUCTIONS_PATH.toLowerCase(),
    )
    add(
      'missing_instructions',
      'files',
      nearMiss
        ? `Rename ${nearMiss.path} to SKILL.md (capital letters, at the top of the folder)`
        : 'A skill needs a SKILL.md file at the top of its folder',
    )
  } else if (
    classifySkillFile(instructions.path, instructions.content) ===
    'instructions'
  ) {
    const front = parseSkillFrontmatter(instructions.content)
    if (!front.ok)
      add(
        'frontmatter',
        `${filePath(SKILL_INSTRUCTIONS_PATH)}.content`,
        front.error,
      )
    else {
      if (front.value.name !== skill.name)
        add(
          'name_mismatch',
          'name',
          `name must equal the SKILL.md frontmatter name "${front.value.name}"`,
        )
      if (front.value.description !== skill.description)
        add(
          'description_mismatch',
          'description',
          'description must equal the SKILL.md frontmatter description',
        )
    }
  }
  return issues
}

function zodIssues(error: z.ZodError): SkillIssue[] {
  return error.issues.map((issue) => ({
    code: 'shape' as const,
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }))
}

function validateWith<T extends SkillManifest>(
  schema: z.ZodType<T>,
  value: unknown,
): SkillValidation<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) }
  const issues = checkSkillFiles(parsed.data)
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: parsed.data, issues: [] }
}

/** Full check of a skill manifest (no storage fields). Unknown keys fail. */
export function validateSkillManifest(
  value: unknown,
): SkillValidation<SkillManifest> {
  return validateWith<SkillManifest>(skillManifestSchema, value)
}

let storedSkillSchema: z.ZodType<SkillRecord> | undefined
/** Full check of a Firestore skill record. Unknown keys fail. */
export function validateSkillRecord(
  value: unknown,
): SkillValidation<SkillRecord> {
  const schema = (storedSkillSchema ??= skillRecordSchema.extend({
    saved_from_chat: z.literal(true).optional(),
  }))
  return validateWith(schema, value)
}

const describeIssues = (issues: SkillIssue[]) =>
  issues.map((i) => `${i.path}: ${i.message}`).join('; ')

/**
 * Reader for `public/skills.json`. Unknown fields are ignored; every entry
 * must be public with a unique id, and its file list must obey the count,
 * path, kind-by-path, size, and no-script rules.
 */
export function parsePublicSkillIndex(value: unknown): SkillIndex {
  const parsed = looseShapes.indexEntry
    .array()
    .safeParse((value as { skills?: unknown } | null)?.skills)
  const version = (value as { skill_schema_version?: unknown } | null)
    ?.skill_schema_version
  if (version !== SKILL_SCHEMA_VERSION)
    throw new Error('Skill index has an unsupported skill_schema_version')
  if (!parsed.success)
    throw new Error('Skill index: ' + describeIssues(zodIssues(parsed.error)))
  const ids = new Set<string>()
  for (const entry of parsed.data) {
    if (entry.visibility !== 'public')
      throw new Error('Skill index contains a non-public skill: ' + entry.id)
    if (ids.has(entry.id)) throw new Error(`Duplicate skill id: ${entry.id}`)
    ids.add(entry.id)
    const seen = new Set<string>()
    let total = 0
    if (entry.files.length > SKILL_MAX_FILES)
      throw new Error(`Skill ${entry.id} lists too many files`)
    if (
      !entry.files.some(
        (f) => f.path === SKILL_INSTRUCTIONS_PATH && f.kind === 'instructions',
      )
    )
      throw new Error(`Skill ${entry.id} has no SKILL.md`)
    for (const file of entry.files) {
      const problem = checkSkillPath(file.path)
      if (problem)
        throw new Error(`Skill ${entry.id}: ${file.path}: ${problem}`)
      if (seen.has(file.path.toLowerCase()))
        throw new Error(`Skill ${entry.id}: duplicate path ${file.path}`)
      seen.add(file.path.toLowerCase())
      if (file.kind === 'script')
        throw new Error(`Skill ${entry.id}: public skills cannot list scripts`)
      // The index omits content. Check everything the path tells us here,
      // then check the actual content (including shebangs) in the version reader.
      if (classifySkillFile(file.path, '') !== file.kind)
        throw new Error(`Skill ${entry.id}: file kind mismatch at ${file.path}`)
      if (file.bytes > SKILL_MAX_FILE_BYTES)
        throw new Error(`Skill ${entry.id}: ${file.path} is too large`)
      total += file.bytes
    }
    if (total > SKILL_MAX_TOTAL_BYTES)
      throw new Error(`Skill ${entry.id} is too large`)
  }
  return {
    skill_schema_version: SKILL_SCHEMA_VERSION,
    skills: parsed.data,
  }
}

/**
 * Reader for `public/skills/<id>/<version>.json`. Unknown fields are
 * ignored, the content rules apply in full, and the file must be public and
 * be exactly the requested id and version. No version substitution.
 */
export function parsePublicSkillVersion(
  value: unknown,
  id: string,
  version: string,
): SkillManifest {
  const parsed = looseShapes.manifest.safeParse(value)
  if (!parsed.success)
    throw new Error(
      `Skill/version not found: ${id}@${version}; ` +
        describeIssues(zodIssues(parsed.error)),
    )
  const skill = parsed.data
  if (
    skill.id !== id ||
    skill.version !== version ||
    skill.visibility !== 'public'
  )
    throw new Error(
      `Skill/version not found: ${id}@${version}; no version substitution was made`,
    )
  const issues = checkSkillFiles(skill)
  if (issues.length)
    throw new Error(
      `Skill ${id}@${version} is invalid: ${describeIssues(issues)}`,
    )
  return skill
}

/** Path of a skill version file relative to the site root. */
export function skillVersionPath(id: string, version: string): string {
  return `skills/${encodeURIComponent(id)}/${encodeURIComponent(version)}.json`
}

/* ---------- Item references (docs/SKILLS.md section 9) ---------- */

export const ITEM_KINDS: readonly ItemKind[] = ['agent', 'skill']

export const itemRefSchema = z.strictObject({
  kind: z.enum(['agent', 'skill']),
  id: agentIdSchema,
  version: versionSchema,
}) satisfies z.ZodType<ItemRef>

export function formatItemRef(ref: ItemRef): string {
  const checked = itemRefSchema.parse(ref)
  return `${checked.kind}:${checked.id}@${checked.version}`
}

/** Parses `<kind>:<id>@<version>`. The version is required: refs are pinned. */
export function parseItemRef(textRef: string): ItemRef {
  const match = textRef.match(/^([a-z]+):([^@:]+)@([^@:]+)$/)
  if (!match)
    throw new Error('Expected an item reference like skill:<id>@<version>')
  const result = itemRefSchema.safeParse({
    kind: match[1],
    id: match[2],
    version: match[3],
  })
  if (!result.success) throw new Error(`Invalid item reference: ${textRef}`)
  return result.data
}
