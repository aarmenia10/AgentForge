import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  validateCatalog,
  validateManifest,
} from '../../../src/lib/validateManifest'
import { createSkillReader, hostedSkillReader } from './skills'
import { resolveAgent, versionUrl } from './versions'
import type { AgentManifest } from '../../../src/types/agent'
import type { OriginApp } from '../../../src/lib/portability'

export const DEFAULT_CATALOG_URL = 'https://agentlemon.web.app/catalog.json'

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

async function readOrigins(
  source: string | URL,
): Promise<Record<string, OriginApp>> {
  let json: string
  if (typeof source === 'string' && /^https?:\/\//.test(source)) {
    const url = new URL('origins.json', source).href
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return {}
    json = await response.text()
  } else {
    try {
      json = await readFile(
        source instanceof URL
          ? source
          : resolve(dirname(resolve(source)), 'origins.json'),
        'utf8',
      )
    } catch {
      return {}
    }
  }
  try {
    return JSON.parse(json) as Record<string, OriginApp>
  } catch {
    return {}
  }
}

export async function loadOrigins(
  source?: string,
): Promise<Record<string, OriginApp>> {
  if (source !== undefined) return readOrigins(source)
  try {
    return await readOrigins(DEFAULT_CATALOG_URL)
  } catch {
    try {
      return await readOrigins(new URL('./origins.json', import.meta.url))
    } catch {
      return readOrigins(
        new URL('../../../public/origins.json', import.meta.url),
      )
    }
  }
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

export function agentResolver(
  catalog: AgentManifest[],
  source = DEFAULT_CATALOG_URL,
) {
  return async (selector: string) =>
    validateManifest(
      await resolveAgent(catalog, selector, async (id, version) => {
        if (/^https?:\/\//.test(source)) {
          const response = await fetch(versionUrl(source, id, version), {
            signal: AbortSignal.timeout(10_000),
          })
          if (!response.ok)
            throw new Error(`Version request failed: HTTP ${response.status}`)
          return response.json()
        }
        return JSON.parse(
          await readFile(
            resolve(dirname(resolve(source)), 'agents', id, `${version}.json`),
            'utf8',
          ),
        )
      }),
    )
}

export function localSkillReader(source = DEFAULT_CATALOG_URL) {
  if (/^https?:\/\//.test(source)) return hostedSkillReader(source)
  return createSkillReader(async (path) =>
    JSON.parse(
      await readFile(
        resolve(dirname(resolve(source)), decodeURIComponent(path)),
        'utf8',
      ),
    ),
  )
}
