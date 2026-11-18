/**
 * Pure logic behind the Manifest Studio: the editable draft, its conversion to
 * an AgentManifest, the field builder that writes JSON Schema, and the
 * plain-English problem list shown beside each field. No React, no Firebase,
 * so tests import it directly.
 */
import {
  AGENT_CATEGORIES,
  type AgentFramework,
  type AgentManifest,
  type AgentRecord,
  type AgentToolType,
  type JsonSchema,
} from '../types/agent'
import type { LintFinding } from './safetyLinter'
import { compareVersions } from './semver'
import { versionSchema } from './manifestSchema'

export type FieldType =
  'text' | 'number' | 'integer' | 'boolean' | 'text-list' | 'object'

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  integer: 'Whole number',
  boolean: 'Yes or no',
  'text-list': 'List of text',
  object: 'Object (any shape)',
}

export interface FieldDraft {
  /** Stable key for React lists. Not part of the schema. */
  key: string
  name: string
  type: FieldType
  required: boolean
  description: string
}

export interface SchemaDraft {
  mode: 'fields' | 'json'
  fields: FieldDraft[]
  json: string
}

export interface ToolDraft {
  key: string
  name: string
  type: AgentToolType
  endpoint: string
  description: string
}

export interface StudioDraft {
  name: string
  id: string
  /** False while the id still follows the name. */
  idEdited: boolean
  version: string
  description: string
  categories: string[]
  tags: string[]
  framework: AgentFramework
  systemPrompt: string
  instructions: string[]
  verificationRules: string[]
  tools: ToolDraft[]
  input: SchemaDraft
  output: SchemaDraft
  visibility: AgentManifest['visibility']
}

let keyCounter = 0
export function newKey(): string {
  keyCounter += 1
  return `k${Date.now().toString(36)}${keyCounter}`
}

export function emptyField(): FieldDraft {
  return {
    key: newKey(),
    name: '',
    type: 'text',
    required: true,
    description: '',
  }
}

export function emptyTool(): ToolDraft {
  return {
    key: newKey(),
    name: '',
    type: 'mcp_tool',
    endpoint: '',
    description: '',
  }
}

export function emptyDraft(): StudioDraft {
  return {
    name: '',
    id: '',
    idEdited: false,
    version: '1.0.0',
    description: '',
    categories: [],
    tags: [],
    framework: 'mcp_native',
    systemPrompt: '',
    instructions: [''],
    verificationRules: [''],
    tools: [],
    input: { mode: 'fields', fields: [emptyField()], json: '' },
    output: { mode: 'fields', fields: [emptyField()], json: '' },
    visibility: 'private',
  }
}

/** "My Great Agent!" -> "my-great-agent". At most 60 characters. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Lowercases and hyphenates a typed tag; returns '' when nothing usable is left. */
export function normalizeTag(value: string): string {
  return slugify(value)
}

/** The next patch number: 1.2.3 -> 1.2.4, 1.2.3-beta -> 1.2.3. */
export function nextPatch(version: string): string {
  const parsed = /^(\d+)\.(\d+)\.(\d+)(-[^+]*)?/.exec(version)
  if (!parsed) return '1.0.0'
  const [, major, minor, patch, pre] = parsed
  if (pre) return `${major}.${minor}.${patch}`
  return `${major}.${minor}.${BigInt(patch) + 1n}`
}

export function isHigherVersion(candidate: string, live: string): boolean {
  if (!versionSchema.safeParse(candidate).success) return false
  if (!versionSchema.safeParse(live).success) return true
  return compareVersions(candidate, live) > 0
}

/* ---------- field builder <-> JSON Schema ---------- */

const SCHEMA_URI = 'https://json-schema.org/draft/2020-12/schema'

function fieldSchema(field: FieldDraft): JsonSchema {
  const description = field.description.trim()
  const base: JsonSchema =
    field.type === 'text'
      ? { type: 'string' }
      : field.type === 'number'
        ? { type: 'number' }
        : field.type === 'integer'
          ? { type: 'integer' }
          : field.type === 'boolean'
            ? { type: 'boolean' }
            : field.type === 'text-list'
              ? { type: 'array', items: { type: 'string' } }
              : { type: 'object' }
  return description ? { ...base, description } : base
}

/** Builds an object schema in the same shape as the seed agents use. */
export function fieldsToSchema(fields: FieldDraft[]): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  for (const field of fields) properties[field.name.trim()] = fieldSchema(field)
  const required = fields.filter((f) => f.required).map((f) => f.name.trim())
  return {
    $schema: SCHEMA_URI,
    type: 'object',
    additionalProperties: false,
    ...(required.length ? { required } : {}),
    properties,
  }
}

function typeOf(property: unknown): FieldType | null {
  if (!property || typeof property !== 'object' || Array.isArray(property))
    return null
  const p = property as Record<string, unknown>
  const keys = Object.keys(p).filter((k) => k !== 'description')
  if (p.description !== undefined && typeof p.description !== 'string')
    return null
  const only = (...allowed: string[]) => keys.every((k) => allowed.includes(k))
  switch (p.type) {
    case 'string':
      return only('type') ? 'text' : null
    case 'number':
      return only('type') ? 'number' : null
    case 'integer':
      return only('type') ? 'integer' : null
    case 'boolean':
      return only('type') ? 'boolean' : null
    case 'object':
      return only('type') ? 'object' : null
    case 'array': {
      const items = p.items as Record<string, unknown> | undefined
      return only('type', 'items') &&
        items &&
        typeof items === 'object' &&
        Object.keys(items).length === 1 &&
        items.type === 'string'
        ? 'text-list'
        : null
    }
    default:
      return null
  }
}

/**
 * Reads a schema back into builder fields. Returns null when the builder
 * cannot show it exactly; the caller then keeps it as JSON.
 */
export function schemaToFields(schema: unknown): FieldDraft[] | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return null
  const s = schema as Record<string, unknown>
  const properties = s.properties
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  )
    return null
  const required = Array.isArray(s.required) ? (s.required as unknown[]) : []
  const fields: FieldDraft[] = []
  for (const [name, property] of Object.entries(properties)) {
    const type = typeOf(property)
    if (!type) return null
    const description = (property as { description?: string }).description
    fields.push({
      key: newKey(),
      name,
      type,
      required: required.includes(name),
      description: description ?? '',
    })
  }
  // Only accept it when regenerating gives back the very same schema.
  return sameJson(fieldsToSchema(fields), schema) ? fields : null
}

/** Order-insensitive deep equality for plain JSON values. */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function schemaDraftFrom(schema: JsonSchema): SchemaDraft {
  const fields = schemaToFields(schema)
  const json = JSON.stringify(schema, null, 2)
  return fields
    ? { mode: 'fields', fields, json }
    : { mode: 'json', fields: [], json }
}

/* ---------- draft <-> manifest ---------- */

export interface Problem {
  /** Manifest path, dotted: `prompt_blueprint.instructions.2`. */
  path: string
  message: string
}

/** The schema a draft describes, or a problem when it cannot produce one. */
export function draftSchema(
  draft: SchemaDraft,
  root: 'input_schema' | 'output_schema',
): { schema: JsonSchema; problems: Problem[] } {
  const problems: Problem[] = []
  if (draft.mode === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft.json)
    } catch {
      return {
        schema: {},
        problems: [
          {
            path: root,
            message:
              'This is not valid JSON. Check for a missing comma, quote, or brace.',
          },
        ],
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {
        schema: {},
        problems: [
          {
            path: root,
            message: 'The schema must be a JSON object, in braces.',
          },
        ],
      }
    return { schema: parsed as JsonSchema, problems }
  }
  const seen = new Set<string>()
  draft.fields.forEach((field) => {
    const name = field.name.trim()
    const path = `${root}.properties.${field.key}`
    if (!name)
      problems.push({
        path: `${path}.name`,
        message: 'Give this field a name.',
      })
    else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      problems.push({
        path: `${path}.name`,
        message:
          'Use letters, digits, and underscores, starting with a letter, like order_id.',
      })
    else if (seen.has(name))
      problems.push({
        path: `${path}.name`,
        message: 'Another field already has this name.',
      })
    seen.add(name)
  })
  return { schema: fieldsToSchema(draft.fields), problems }
}

export interface Identity {
  uid: string
  name: string
  handle: string
}

/** A stand-in identity for validation before the profile has loaded. The service sets the real one. */
export const PLACEHOLDER_IDENTITY: Identity = {
  uid: 'pending',
  name: 'You',
  handle: 'your-handle',
}

export function draftToManifest(
  draft: StudioDraft,
  identity: Identity,
  now = new Date(),
): { manifest: AgentManifest; problems: Problem[] } {
  const input = draftSchema(draft.input, 'input_schema')
  const output = draftSchema(draft.output, 'output_schema')
  const tags = [...new Set([...draft.categories, ...draft.tags])]
  const manifest: AgentManifest = {
    schema_version: 2,
    visibility: draft.visibility,
    id: draft.id.trim(),
    name: draft.name.trim(),
    version: draft.version.trim(),
    description: draft.description.trim(),
    author: { ...identity, verified: false },
    tags,
    framework: draft.framework,
    tools_required: draft.tools.map((tool) => {
      const endpoint = tool.endpoint.trim()
      return {
        name: tool.name.trim(),
        type: tool.type,
        ...(endpoint ? { endpoint } : {}),
        description: tool.description.trim(),
      }
    }),
    input_schema: input.schema,
    output_schema: output.schema,
    prompt_blueprint: {
      system_prompt: draft.systemPrompt,
      instructions: draft.instructions.map((s) => s.trim()),
      verification_rules: draft.verificationRules.map((s) => s.trim()),
    },
    stats: { stars: 0, views: 0, updated_at: now.toISOString() },
  }
  return { manifest, problems: [...input.problems, ...output.problems] }
}

export function recordToDraft(
  record: AgentManifest | AgentRecord,
): StudioDraft {
  const categoryTags = new Set<string>(AGENT_CATEGORIES.map((c) => c.tag))
  return {
    name: record.name,
    id: record.id,
    idEdited: true,
    version: record.version,
    description: record.description,
    categories: record.tags.filter((t) => categoryTags.has(t)),
    tags: record.tags.filter((t) => !categoryTags.has(t)),
    framework: record.framework,
    systemPrompt: record.prompt_blueprint.system_prompt,
    instructions: [...record.prompt_blueprint.instructions],
    verificationRules: [...record.prompt_blueprint.verification_rules],
    tools: record.tools_required.map((tool) => ({
      key: newKey(),
      name: tool.name,
      type: tool.type,
      endpoint: tool.endpoint ?? '',
      description: tool.description,
    })),
    input: schemaDraftFrom(record.input_schema),
    output: schemaDraftFrom(record.output_schema),
    visibility: record.visibility,
  }
}

/* ---------- plain-English validation messages ---------- */

interface ZodLikeIssue {
  path: PropertyKey[]
  code?: string
  message?: string
}

/** Turns a validator issue into a sentence about the field it names. */
export function plainIssue(issue: ZodLikeIssue): Problem {
  const parts = issue.path.map(String)
  const path = parts.join('.')
  const [top, second, third] = parts
  const empty = issue.code === 'too_small' || /blank/i.test(issue.message ?? '')
  const message = (() => {
    switch (top) {
      case 'name':
        return 'Give your agent a name.'
      case 'id':
        return 'Use lowercase letters, digits, and single hyphens, like invoice-checker.'
      case 'version':
        return 'Use a version number like 1.0.0.'
      case 'description':
        return 'Describe in a sentence or two what the agent does.'
      case 'tags':
        if (second === undefined)
          return /duplicate/i.test(issue.message ?? '')
            ? 'Each tag can appear once.'
            : 'Pick a category or add at least one tag.'
        return 'Tags use lowercase letters, digits, and hyphens.'
      case 'framework':
        return 'Choose a framework.'
      case 'visibility':
        return 'Choose who can see this agent.'
      case 'tools_required':
        if (second === undefined) return 'Two tools have the same name.'
        if (third === 'name') return 'Give this tool a name.'
        if (third === 'description') return 'Say what this tool does.'
        if (third === 'endpoint')
          return 'Remove the spaces or leave this empty.'
        return 'Check this tool.'
      case 'prompt_blueprint':
        if (second === 'system_prompt')
          return 'Write the system prompt the agent starts from.'
        if (second === 'instructions')
          return third === undefined
            ? 'Add at least one step.'
            : 'This step is empty. Write it or remove it.'
        if (second === 'verification_rules')
          return third === undefined
            ? 'Add at least one check.'
            : 'This check is empty. Write it or remove it.'
        return 'Check the prompt.'
      case 'input_schema':
      case 'output_schema':
        return 'This schema is not valid.'
      default:
        return empty ? 'This cannot be empty.' : 'Check this field.'
    }
  })()
  return { path, message }
}

/* ---------- finding paths ---------- */

/** `prompt_blueprint.instructions[2]` -> `prompt_blueprint.instructions.2`. */
export function dottedPath(path: string): string {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[("(?:[^"\\]|\\.)*")\]/g, (_, key: string) => {
      try {
        return '.' + String(JSON.parse(key))
      } catch {
        return '.' + key
      }
    })
    .replace(/^\./, '')
}

/** True when `path` is `prefix` or lies inside it. */
export function within(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '.')
}

const STEP_LABELS: [string, string][] = [
  ['name', 'Name'],
  ['id', 'Id'],
  ['version', 'Version'],
  ['description', 'Description'],
  ['tags', 'Tags'],
  ['framework', 'Framework'],
  ['visibility', 'Visibility'],
  ['prompt_blueprint.system_prompt', 'System prompt'],
]

/** A reader-friendly name for a manifest path: "Instructions, step 3". */
export function pathLabel(path: string): string {
  const p = dottedPath(path)
  for (const [prefix, label] of STEP_LABELS) if (within(p, prefix)) return label
  let m = /^prompt_blueprint\.instructions(?:\.(\d+))?/.exec(p)
  if (m) return m[1] ? `Instructions, step ${Number(m[1]) + 1}` : 'Instructions'
  m = /^prompt_blueprint\.verification_rules(?:\.(\d+))?/.exec(p)
  if (m)
    return m[1]
      ? `Verification rules, check ${Number(m[1]) + 1}`
      : 'Verification rules'
  m = /^tools_required(?:\.(\d+))?(?:\.(\w+))?/.exec(p)
  if (m) {
    if (!m[1]) return 'Required tools'
    const field = m[2] ? `, ${m[2]}` : ''
    return `Tool ${Number(m[1]) + 1}${field}`
  }
  m = /^(input|output)_schema(?:\.properties\.([^.]+))?/.exec(p)
  if (m) {
    const side = m[1] === 'input' ? 'Input' : 'Output'
    return m[2] ? `${side} field "${m[2]}"` : `${side} schema`
  }
  return p
}

/** Which Studio step a manifest path belongs to. */
export type StepId = 'basics' | 'prompt' | 'tools' | 'io' | 'visibility'
export function stepOf(path: string): StepId {
  const p = dottedPath(path)
  if (p.startsWith('prompt_blueprint')) return 'prompt'
  if (p.startsWith('tools_required')) return 'tools'
  if (p.startsWith('input_schema') || p.startsWith('output_schema')) return 'io'
  if (p.startsWith('visibility')) return 'visibility'
  return 'basics'
}

export function hasBlock(findings: readonly LintFinding[]): boolean {
  return findings.some((f) => f.severity === 'block')
}

/* ---------- local draft storage ---------- */

export interface StoredDraft {
  savedAt: string
  /** `stats.updated_at` of the record the draft started from, or null for a new agent. */
  base: string | null
  draft: StudioDraft
}

export function draftStorageKey(editId: string | null): string {
  return editId ? `agentlemon.studio.edit.${editId}` : 'agentlemon.studio.new'
}

export function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (!parsed || typeof parsed !== 'object' || !parsed.draft) return null
    // Fill any field a newer Studio added since the draft was written.
    return { ...parsed, draft: { ...emptyDraft(), ...parsed.draft } }
  } catch {
    return null
  }
}

export function writeStoredDraft(key: string, value: StoredDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the draft simply is not kept.
  }
}

export function clearStoredDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to do.
  }
}
