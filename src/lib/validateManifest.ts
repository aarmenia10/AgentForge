import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { AgentManifest, AgentRecord } from '../types/agent'

import {
  agentIdSchema,
  agentRecordSchema,
  authorHandleSchema,
  manifestSchema,
  versionSchema,
} from './manifestSchema'

export {
  agentIdSchema,
  agentRecordSchema,
  authorHandleSchema,
  manifestSchema,
  versionSchema,
}

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
