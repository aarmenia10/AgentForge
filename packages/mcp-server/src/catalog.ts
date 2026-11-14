import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { validateCatalog } from '../../../src/lib/validateManifest'
import type { AgentManifest } from '../../../src/types/agent'

export const DEFAULT_CATALOG_URL =
  'https://agentforge-b10db.web.app/catalog.json'

async function readCatalog(source: string | URL): Promise<AgentManifest[]> {
  let json: string
  if (typeof source === 'string' && /^https?:\/\//.test(source)) {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw new Error(`Catalog request failed: HTTP ${response.status}`)
    json = await response.text()
  } else {
    json = await readFile(
      source instanceof URL ? source : resolve(source),
      'utf8',
    )
  }
  return validateCatalog(JSON.parse(json))
}

export async function loadCatalog(source?: string): Promise<AgentManifest[]> {
  // An explicit source is authoritative, even if it is the default URL or empty.
  // Never mask an override's network, filesystem, parse, or validation error.
  if (source !== undefined) return readCatalog(source)
  try {
    return await readCatalog(DEFAULT_CATALOG_URL)
  } catch {
    // Resolve against the package, never the caller's working directory.
    // This works from both src/ and the published dist/ executable.
    return readCatalog(new URL('../catalog.json', import.meta.url))
  }
}

export { selectAgent } from './shared'
