import { createCouncilReader, hostedCouncilReader } from './councils'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  validateCatalog,
  validateManifest,
} from '../../../src/lib/validateManifest'
import { createSkillReader, hostedSkillReader } from './skills'
import { resolveAgent, versionUrl } from './versions'
import {
  PublicFileMissing,
  readPublicResponse,
  UNREACHABLE_MESSAGE,
} from './shared'
import type { AgentManifest } from '../../../src/types/agent'
import { parseOrigins, type OriginApp } from '../../../src/lib/portability'

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
    return parseOrigins(JSON.parse(json))
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

/** Reads a JSON file next to a local catalog; a missing file is "not published". */
async function readLocalJson(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new PublicFileMissing(path)
    throw error
  }
  return JSON.parse(text)
}

export function agentResolver(
  catalog: AgentManifest[],
  source = DEFAULT_CATALOG_URL,
) {
  return async (selector: string) =>
    validateManifest(
      await resolveAgent(catalog, selector, async (id, version) => {
        if (/^https?:\/\//.test(source)) {
          const url = versionUrl(source, id, version)
          let response: Response
          try {
            response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
          } catch {
            throw new Error(UNREACHABLE_MESSAGE)
          }
          return readPublicResponse(response, url)
        }
        return readLocalJson(
          resolve(dirname(resolve(source)), 'agents', id, `${version}.json`),
        )
      }),
    )
}

export function localSkillReader(source = DEFAULT_CATALOG_URL) {
  if (/^https?:\/\//.test(source)) return hostedSkillReader(source)
  return createSkillReader(async (path) =>
    readLocalJson(resolve(dirname(resolve(source)), decodeURIComponent(path))),
  )
}

export function localCouncilReader(
  source = DEFAULT_CATALOG_URL,
  origins: Record<string, OriginApp> = {},
) {
  if (/^https?:\/\//.test(source))
    return hostedCouncilReader(source, undefined, origins)
  return createCouncilReader(
    async (path) =>
      readLocalJson(
        resolve(dirname(resolve(source)), decodeURIComponent(path)),
      ),
    origins,
  )
}
