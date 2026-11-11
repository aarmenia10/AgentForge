import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  validateCatalog,
  agentIdSchema,
  versionSchema,
} from '../../../src/lib/validateManifest'
import type { AgentManifest } from '../../../src/types/agent'

export async function loadCatalog(source?: string): Promise<AgentManifest[]> {
  let json: string
  if (source && /^https?:\/\//.test(source)) {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      throw new Error(`Catalog request failed: HTTP ${response.status}`)
    json = await response.text()
  } else if (source) {
    json = await readFile(resolve(source), 'utf8')
  } else {
    try {
      json = await readFile(resolve('public/catalog.json'), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // Works both from src/ during development and dist/ in the published package.
      json = await readFile(new URL('../catalog.json', import.meta.url), 'utf8')
    }
  }
  return validateCatalog(JSON.parse(json))
}

export function selectAgent(
  catalog: AgentManifest[],
  selector: string,
): AgentManifest {
  const parts = selector.split('@')
  if (parts.length > 2) throw new Error('Expected <id> or <id>@<version>')
  const id = agentIdSchema.parse(parts[0])
  const version = parts.length === 2 ? versionSchema.parse(parts[1]) : undefined
  const agent = catalog.find(
    (a) => a.id === id && (!version || a.version === version),
  )
  if (!agent)
    throw new Error(
      `Agent/version not found: ${selector}; no version substitution was made`,
    )
  return agent
}
