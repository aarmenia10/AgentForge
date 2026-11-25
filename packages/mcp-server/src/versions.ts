// Shared by Node and Workers: no Node APIs or schema compilation here.
import {
  agentIdSchema,
  versionSchema,
  manifestSchema,
} from '../../../src/lib/manifestSchema'
import type { AgentManifest } from '../../../src/types/agent'
import {
  notPublicMessage,
  PublicFileMissing,
  type PrivateItemHint,
} from './shared'

export type VersionReader = (id: string, version: string) => Promise<unknown>

export async function resolveAgent(
  catalog: readonly AgentManifest[],
  selector: string,
  readVersion: VersionReader,
  hint: PrivateItemHint = 'connector_link',
): Promise<AgentManifest> {
  const parts = selector.split('@')
  if (parts.length > 2) throw new Error('Expected <id> or <id>@<version>')
  const id = agentIdSchema.parse(parts[0])
  const version = parts.length === 2 ? versionSchema.parse(parts[1]) : undefined
  const current = catalog.find((agent) => agent.id === id)
  // Current catalog membership gates history too: never resurrect a takedown.
  if (!current)
    throw new Error(
      `Agent/version not found: ${selector}. ${notPublicMessage('agent', id, hint)}`,
    )
  if (!version || current.version === version) return current
  const notPublished = () =>
    new Error(
      `Agent/version not found: ${selector}. ${notPublicMessage('agent', id, hint, { requested: version, current: current.version })}`,
    )
  let raw: unknown
  try {
    raw = await readVersion(id, version)
  } catch (error) {
    if (error instanceof PublicFileMissing) throw notPublished()
    throw error
  }
  const manifest = manifestSchema.parse(raw)
  if (
    manifest.id !== id ||
    manifest.version !== version ||
    manifest.visibility !== 'public'
  )
    throw new Error(
      `Agent/version not found: ${selector}; no version substitution was made`,
    )
  return manifest
}

export function versionUrl(
  catalogUrl: string,
  id: string,
  version: string,
): string {
  return new URL(
    `agents/${encodeURIComponent(id)}/${encodeURIComponent(version)}.json`,
    catalogUrl,
  ).href
}
