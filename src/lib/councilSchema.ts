/**
 * Council validator (P3-14). Specification: docs/COUNCILS.md.
 *
 * This module imports nothing but zod, the shared id/version/handle schemas,
 * and types, so the site, the exporter, the local server, and the remote
 * connector's Worker all run identical checks. Keep it free of Node APIs and
 * Ajv: Workers forbid runtime code generation.
 */
import { z } from 'zod'
import {
  agentIdSchema,
  authorHandleSchema,
  versionSchema,
} from './manifestSchema'
import { formatItemRef, itemRefSchema, utf8ByteLength } from './skillSchema'
export { COUNCIL_SCHEMA_VERSION } from '../types/council'
import {
  COUNCIL_SCHEMA_VERSION,
  type CouncilIndex,
  type CouncilManifest,
  type CouncilMember,
  type CouncilRecord,
  type CouncilVisibility,
} from '../types/council'
import type { ItemRef } from '../types/skill'

/* ---------- Limits (docs/COUNCILS.md section 4) ---------- */

export const COUNCIL_MIN_MEMBERS = 2
export const COUNCIL_MAX_MEMBERS = 20
export const COUNCIL_NAME_MAX = 64
export const COUNCIL_DESCRIPTION_MAX = 1024
export const COUNCIL_MAX_TAGS = 10
export const COUNCIL_ROLE_MAX = 200
const councilOriginSchema = z.enum(['claude', 'chatgpt', 'other'])
export const COUNCIL_MAX_INSTRUCTIONS_BYTES = 100 * 1024 // 100 KB (102,400 bytes)
export const COUNCIL_MAX_TOTAL_BYTES = 200 * 1024 // 200 KB (204,800 bytes)

/* ---------- Small pure helpers ---------- */

/**
 * Calculates total UTF-8 byte length for a council's stored text content.
 */
export function councilTotalBytes(council: {
  name: string
  description: string
  instructions: string
  tags: string[]
  origin_app?: string
  members: CouncilMember[]
}): number {
  let bytes =
    utf8ByteLength(council.name) +
    utf8ByteLength(council.description) +
    utf8ByteLength(council.instructions)
  for (const tag of council.tags) {
    bytes += utf8ByteLength(tag)
  }
  if (council.origin_app) {
    bytes += utf8ByteLength(council.origin_app)
  }
  for (const m of council.members) {
    bytes +=
      utf8ByteLength(m.ref.kind) +
      utf8ByteLength(m.ref.id) +
      utf8ByteLength(m.ref.version) +
      utf8ByteLength(m.role) +
      8 // representation overhead for numerical order
  }
  return bytes
}

/* ---------- Issues and Validation Types ---------- */

export type CouncilIssueCode =
  | 'shape'
  | 'member_count'
  | 'duplicate_member'
  | 'invalid_order'
  | 'role_empty'
  | 'role_too_long'
  | 'instructions_empty'
  | 'instructions_too_large'
  | 'total_too_large'
  | 'tag_count'
  | 'member_not_public_approved'

export interface CouncilIssue {
  code: CouncilIssueCode
  path: string
  message: string
}

export type CouncilValidation<T> =
  { ok: true; value: T; issues: [] } | { ok: false; issues: CouncilIssue[] }

export interface CouncilValidationOptions {
  /**
   * Predicate checking whether a referenced member is currently public and
   * approved. Required by the public-members rule for public councils.
   */
  isMemberApproved?: (ref: ItemRef) => boolean
}

/* ---------- Base field schemas ---------- */

export const visibilitySchema = z.enum([
  'public',
  'friends',
  'private',
]) as z.ZodType<CouncilVisibility>

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, 'Text must not be blank')

function makeAuthorSchema(strict: boolean) {
  const obj = strict ? z.strictObject : z.object
  return obj({
    uid: text,
    name: text,
    handle: authorHandleSchema,
    verified: z.boolean(),
  })
}

function makeMemberSchema(strict: boolean) {
  const obj = strict ? z.strictObject : z.object
  return obj({
    ref: strict ? itemRefSchema : itemRefSchema.strip(),
    role: z
      .string()
      .min(1, 'Member role must not be blank')
      .max(COUNCIL_ROLE_MAX, `Role exceeds ${COUNCIL_ROLE_MAX} characters`)
      .refine((v) => v.trim().length > 0, 'Member role must not be blank'),
    order: z
      .number()
      .int('Member order must be an integer')
      .min(1, 'Member order must be positive (>= 1)'),
  })
}

function makeStatsSchema(strict: boolean) {
  const obj = strict ? z.strictObject : z.object
  return obj({
    updated_at: text,
  })
}

/* ---------- Strict Schemas for Writers (reject unknown fields) ---------- */

export const councilMemberSchema = makeMemberSchema(
  true,
) as z.ZodType<CouncilMember>
export const councilStatsSchema = makeStatsSchema(true)

export const councilManifestSchema = z.strictObject({
  council_schema_version: z.literal(COUNCIL_SCHEMA_VERSION),
  visibility: visibilitySchema,
  id: agentIdSchema.max(1500),
  version: versionSchema,
  name: text.max(
    COUNCIL_NAME_MAX,
    `Name exceeds ${COUNCIL_NAME_MAX} characters`,
  ),
  description: text.max(
    COUNCIL_DESCRIPTION_MAX,
    `Description exceeds ${COUNCIL_DESCRIPTION_MAX} characters`,
  ),
  author: makeAuthorSchema(true),
  tags: z
    .array(agentIdSchema)
    .min(1, 'Council must have at least one tag')
    .max(
      COUNCIL_MAX_TAGS,
      `Council cannot have more than ${COUNCIL_MAX_TAGS} tags`,
    )
    .refine(
      (items) => new Set(items).size === items.length,
      'Tags must be unique',
    ),
  origin_app: councilOriginSchema.optional(),
  instructions: z.string(),
  members: z.array(councilMemberSchema),
  stats: councilStatsSchema,
}) satisfies z.ZodType<CouncilManifest>

export const councilRecordSchema = councilManifestSchema.extend({
  owner_uid: text,
  review_status: z.enum(['pending', 'approved', 'rejected']),
  saved_from_chat: z.boolean().optional(),
}) satisfies z.ZodType<CouncilRecord>

/* ---------- Loose Schemas for Readers (ignore unknown fields) ---------- */

const looseMemberSchema = makeMemberSchema(false)
const looseAuthorSchema = makeAuthorSchema(false)
const looseStatsSchema = makeStatsSchema(false)

const looseManifestSchema = z.object({
  council_schema_version: z.literal(COUNCIL_SCHEMA_VERSION),
  visibility: visibilitySchema,
  id: agentIdSchema.max(1500),
  version: versionSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  author: looseAuthorSchema,
  tags: z.array(z.string()),
  origin_app: councilOriginSchema.optional(),
  instructions: z.string().min(1),
  members: z.array(looseMemberSchema),
  stats: looseStatsSchema,
})

const looseIndexEntrySchema = z.object({
  council_schema_version: z.literal(COUNCIL_SCHEMA_VERSION),
  visibility: visibilitySchema,
  id: agentIdSchema.max(1500),
  version: versionSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  author: looseAuthorSchema,
  tags: z.array(z.string()),
  origin_app: councilOriginSchema.optional(),
  members: z.array(looseMemberSchema),
  stats: looseStatsSchema,
  instructions_bytes: z.number().int().nonnegative(),
  member_count: z.number().int().positive(),
})

/* ---------- Semantic Rules & Invariant Checks ---------- */

/**
 * Checks member rules, limits, duplicate members, instructions size,
 * total size cap, and the public-members rule.
 */
export function checkCouncil(
  council: CouncilManifest,
  options?: CouncilValidationOptions,
): CouncilIssue[] {
  const issues: CouncilIssue[] = []
  const add = (code: CouncilIssueCode, path: string, message: string) => {
    issues.push({ code, path, message })
  }

  // Member count limit
  if (council.members.length < COUNCIL_MIN_MEMBERS) {
    add(
      'member_count',
      'members',
      `Council must have at least ${COUNCIL_MIN_MEMBERS} members`,
    )
  } else if (council.members.length > COUNCIL_MAX_MEMBERS) {
    add(
      'member_count',
      'members',
      `Council cannot have more than ${COUNCIL_MAX_MEMBERS} members`,
    )
  }

  // Member uniqueness, order, role, and public-members rule
  const seenRefs = new Set<string>()
  council.members.forEach((member, index) => {
    let refKey: string | null = null
    try {
      refKey = formatItemRef(member.ref)
    } catch {
      // Shape failure handled by zod
    }

    if (refKey) {
      if (seenRefs.has(refKey)) {
        add(
          'duplicate_member',
          `members.${index}.ref`,
          `Duplicate member reference: ${refKey}`,
        )
      } else {
        seenRefs.add(refKey)
      }
    }

    if (!member.role || member.role.trim().length === 0) {
      add(
        'role_empty',
        `members.${index}.role`,
        'Member role must not be blank',
      )
    } else if (member.role.length > COUNCIL_ROLE_MAX) {
      add(
        'role_too_long',
        `members.${index}.role`,
        `Member role exceeds ${COUNCIL_ROLE_MAX} characters`,
      )
    }

    if (!Number.isInteger(member.order) || member.order < 1) {
      add(
        'invalid_order',
        `members.${index}.order`,
        'Member order must be a positive integer (>= 1)',
      )
    }

    // Public council rule: a public council may contain only public, approved members
    if (council.visibility === 'public' && options?.isMemberApproved) {
      if (!options.isMemberApproved(member.ref)) {
        const refStr =
          refKey ?? `${member.ref.kind}:${member.ref.id}@${member.ref.version}`
        add(
          'member_not_public_approved',
          `members.${index}.ref`,
          `Public council member ${refStr} must be public and approved`,
        )
      }
    }
  })

  // Instructions
  if (!council.instructions || council.instructions.trim().length === 0) {
    add(
      'instructions_empty',
      'instructions',
      'Council instructions must not be blank',
    )
  } else {
    const instBytes = utf8ByteLength(council.instructions)
    if (instBytes > COUNCIL_MAX_INSTRUCTIONS_BYTES) {
      add(
        'instructions_too_large',
        'instructions',
        `Council instructions (${instBytes} bytes) exceed ${COUNCIL_MAX_INSTRUCTIONS_BYTES / 1024} KB limit`,
      )
    }
  }

  // Total size cap
  const total = councilTotalBytes(council)
  if (total > COUNCIL_MAX_TOTAL_BYTES) {
    add(
      'total_too_large',
      '(root)',
      `Total council size (${total} bytes) exceeds ${COUNCIL_MAX_TOTAL_BYTES / 1024} KB limit`,
    )
  }

  return issues
}

function zodIssues(error: z.ZodError): CouncilIssue[] {
  return error.issues.map((issue) => ({
    code: 'shape' as const,
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }))
}

const describeIssues = (issues: CouncilIssue[]) =>
  issues.map((i) => `${i.path}: ${i.message}`).join('; ')

function validateWith<T extends CouncilManifest>(
  schema: z.ZodType<T>,
  value: unknown,
  options?: CouncilValidationOptions,
): CouncilValidation<T> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) }
  const issues = checkCouncil(parsed.data, options)
  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: parsed.data, issues: [] }
}

/** Full check of a council manifest (no storage fields). Unknown keys fail. */
export function validateCouncilManifest(
  value: unknown,
  options?: CouncilValidationOptions,
): CouncilValidation<CouncilManifest> {
  return validateWith<CouncilManifest>(councilManifestSchema, value, options)
}

/** Full check of a Firestore council record. Unknown keys fail. */
export function validateCouncilRecord(
  value: unknown,
  options?: CouncilValidationOptions,
): CouncilValidation<CouncilRecord> {
  return validateWith<CouncilRecord>(councilRecordSchema, value, options)
}

/* ---------- Public File Readers (ignore unknown fields) ---------- */

/**
 * Reader for public/councils.json. Unknown fields are ignored; every entry
 * must be public with a unique id, and its member list must obey count,
 * uniqueness, and approval rules.
 */
export function parsePublicCouncilIndex(
  value: unknown,
  options?: CouncilValidationOptions,
): CouncilIndex {
  const version = (value as { council_schema_version?: unknown } | null)
    ?.council_schema_version
  if (version !== COUNCIL_SCHEMA_VERSION)
    throw new Error('Council index has an unsupported council_schema_version')

  const parsed = looseIndexEntrySchema
    .array()
    .safeParse((value as { councils?: unknown } | null)?.councils)
  if (!parsed.success)
    throw new Error('Council index: ' + describeIssues(zodIssues(parsed.error)))

  const ids = new Set<string>()
  for (const entry of parsed.data) {
    if (entry.visibility !== 'public')
      throw new Error(
        'Council index contains a non-public council: ' + entry.id,
      )
    if (ids.has(entry.id)) throw new Error(`Duplicate council id: ${entry.id}`)
    ids.add(entry.id)

    if (
      entry.members.length < COUNCIL_MIN_MEMBERS ||
      entry.members.length > COUNCIL_MAX_MEMBERS
    ) {
      throw new Error(`Council ${entry.id} has invalid member count`)
    }
    if (entry.member_count !== entry.members.length) {
      throw new Error(`Council ${entry.id} member_count mismatch`)
    }
    if (entry.instructions_bytes > COUNCIL_MAX_INSTRUCTIONS_BYTES) {
      throw new Error(`Council ${entry.id} instructions_bytes exceeds limit`)
    }

    const seenRefs = new Set<string>()
    for (const m of entry.members) {
      const refKey = formatItemRef(m.ref)
      if (seenRefs.has(refKey)) {
        throw new Error(`Council ${entry.id} lists duplicate member: ${refKey}`)
      }
      seenRefs.add(refKey)

      if (options?.isMemberApproved && !options.isMemberApproved(m.ref)) {
        throw new Error(
          `Public council ${entry.id} contains non-approved member: ${refKey}`,
        )
      }
    }
  }

  return {
    council_schema_version: COUNCIL_SCHEMA_VERSION,
    councils: parsed.data,
  }
}

/**
 * Reader for public/councils/<id>/<version>.json. Unknown fields are
 * ignored, all content rules apply in full, and the file must be public and
 * match the requested id and version exactly. No version substitution.
 */
export function parsePublicCouncilVersion(
  value: unknown,
  id: string,
  version: string,
  options?: CouncilValidationOptions,
): CouncilManifest {
  const parsed = looseManifestSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      `Council/version not found: ${id}@${version}; ` +
        describeIssues(zodIssues(parsed.error)),
    )
  }

  const council = parsed.data as CouncilManifest
  if (
    council.id !== id ||
    council.version !== version ||
    council.visibility !== 'public'
  ) {
    throw new Error(
      `Council/version not found: ${id}@${version}; no version substitution was made`,
    )
  }

  const issues = checkCouncil(council, options)
  if (issues.length) {
    throw new Error(
      `Council ${id}@${version} is invalid: ${describeIssues(issues)}`,
    )
  }

  return council
}

/** Path of a council version file relative to the site root. */
export function councilVersionPath(id: string, version: string): string {
  return `councils/${encodeURIComponent(id)}/${encodeURIComponent(version)}.json`
}

/** Formats a council reference string: council:<id>@<version>. */
export function formatCouncilRef(id: string, version: string): string {
  return `council:${id}@${version}`
}

/** Parses a council reference string like council:<id>@<version>. */
export function parseCouncilRef(textRef: string): {
  kind: 'council'
  id: string
  version: string
} {
  const match = textRef.match(/^council:([^@:]+)@([^@:]+)$/)
  if (!match) {
    throw new Error('Expected a council reference like council:<id>@<version>')
  }
  const idCheck = agentIdSchema.safeParse(match[1])
  const verCheck = versionSchema.safeParse(match[2])
  if (!idCheck.success || !verCheck.success) {
    throw new Error(`Invalid council reference: ${textRef}`)
  }
  return { kind: 'council', id: idCheck.data, version: verCheck.data }
}
