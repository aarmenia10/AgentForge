import { z } from 'zod'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { AgentManifest, AgentRecord } from '../types/agent'

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, 'Text must not be blank')
export const agentIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const versionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/,
  )
export const authorHandleSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/)
  .refine(
    (value) => value === value.trim(),
    'Handle must not contain whitespace',
  )
const schemaDocument = z.record(z.string(), z.unknown())

/** Strict runtime counterpart of the canonical interface. Never coerce live data. */
export const manifestSchema = z.strictObject({
  schema_version: z.literal(2),
  visibility: z.enum(['public', 'friends', 'private']),
  id: agentIdSchema,
  name: text,
  version: versionSchema,
  description: text,
  author: z.strictObject({
    uid: text,
    name: text,
    handle: authorHandleSchema,
    verified: z.boolean(),
  }),
  tags: z
    .array(agentIdSchema)
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'Duplicate tags'),
  framework: z.enum(['crewai', 'langchain', 'autogen', 'mcp_native', 'custom']),
  tools_required: z
    .array(
      z.strictObject({
        name: text,
        type: z.enum(['mcp_tool', 'python_function', 'rest_api']),
        endpoint: text.optional(),
        description: text,
      }),
    )
    .refine(
      (v) => new Set(v.map((t) => t.name)).size === v.length,
      'Duplicate tool names',
    ),
  input_schema: schemaDocument,
  output_schema: schemaDocument,
  prompt_blueprint: z.strictObject({
    system_prompt: text,
    instructions: z.array(text).min(1),
    verification_rules: z.array(text).min(1),
  }),
  stats: z.strictObject({
    stars: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
    updated_at: z.iso.datetime({ offset: true }),
  }),
}) satisfies z.ZodType<AgentManifest>

export const agentRecordSchema = manifestSchema.extend({
  owner_uid: text,
  review_status: z.enum(['pending', 'approved', 'rejected']),
  shared_with: z.array(text).max(100),
}) satisfies z.ZodType<AgentRecord>

export function validateAgentRecord(value: unknown): AgentRecord {
  const record = agentRecordSchema.parse(value)
  // Strip storage metadata before reusing manifest and JSON Schema validation.
  validateManifest(manifestSchema.strip().parse(record))
  return record
}

export function createSchemaValidator() {
  // No remote reference fetching. Unresolvable refs fail closed during compilation.
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    validateFormats: true,
  })
  addFormats(ajv)
  return ajv
}

export function validateManifest(value: unknown): AgentManifest {
  const manifest = manifestSchema.parse(value)
  for (const field of ['input_schema', 'output_schema'] as const) {
    try {
      createSchemaValidator().compile(manifest[field])
    } catch (error) {
      throw new Error(`${manifest.id}.${field}: invalid JSON Schema`, {
        cause: error,
      })
    }
  }
  return manifest
}

export function validateCatalog(value: unknown): AgentManifest[] {
  if (!Array.isArray(value)) throw new Error('Catalog must be an array')
  const agents = value.map(validateManifest)
  const ids = new Set<string>()
  for (const agent of agents) {
    if (agent.visibility !== 'public')
      throw new Error('Catalog contains a non-public agent: ' + agent.id)
    if (ids.has(agent.id)) throw new Error(`Duplicate catalog id: ${agent.id}`)
    ids.add(agent.id)
  }
  return agents
}
