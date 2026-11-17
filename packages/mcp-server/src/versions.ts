// Shared by Node and Workers: no Node APIs or schema compilation here.
import {
  agentIdSchema,
  versionSchema,
  manifestSchema,
} from '../../../src/lib/manifestSchema'
import type { AgentManifest } from '../../../src/types/agent'

export type VersionReader = (id: string, version: string) => Promise<unknown>

export async function resolveAgent(
  catalog: readonly AgentManifest[],
  selector: string,
  readVersion: VersionReader,
): Promise<AgentManifest> {
  const parts = selector.split('@')
  if (parts.length > 2) throw new Error('Expected <id> or <id>@<version>')
  const id = agentIdSchema.parse(parts[0])
  const version = parts.length === 2 ? versionSchema.parse(parts[1]) : undefined
  const current = catalog.find((agent) => agent.id === id)
  // Current catalog membership gates history too: never resurrect a takedown.
  if (!current) throw new Error(`Agent/version not found: ${selector}`)
  if (!version || current.version === version) return current
  const manifest = manifestSchema.parse(await readVersion(id, version))
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
