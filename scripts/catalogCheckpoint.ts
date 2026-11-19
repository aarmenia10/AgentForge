import { readFile, writeFile } from 'node:fs/promises'
import { manifestSchema, parsePublicCatalog } from '../src/lib/manifestSchema'
import {
  parsePublicSkillIndex,
  parsePublicSkillVersion,
  skillVersionPath,
} from '../src/lib/skillSchema'
import { exportDigest, sortOrigins } from './export-catalog'
import type { PublicExport } from './export-catalog'
import type { OriginApp } from '../src/lib/portability'

const runDay = new Date().toISOString().slice(0, 10)
const scope = () =>
  [process.env.GOOGLE_CLOUD_PROJECT, process.env.GITHUB_SHA].join('/')

// Only already-public files are cached. The live Hosting digest covers the
// entire reconstructed release, including version paths. A cache is disposable.
export async function saveCheckpoint(path: string, result: PublicExport) {
  await writeFile(
    path,
    JSON.stringify({
      format: 2,
      skillIndex: result.skillIndex,
      skillVersions: [...result.skillFiles.values()],
      scope: scope(),
      day: runDay,
      catalog: result.catalog,
      versions: [...result.files.values()],
      ...(result.origins !== undefined ? { origins: result.origins } : {}),
    }),
  )
}

export async function readCheckpoint(
  path: string,
  liveState?: string,
): Promise<PublicExport | undefined> {
  try {
    if (!liveState) return undefined
    const [stored, live] = await Promise.all([
      readFile(path, 'utf8'),
      readFile(liveState, 'utf8'),
    ])
    const data = JSON.parse(stored)
    if (
      data.format !== 2 ||
      data.scope !== scope() ||
      data.day !== runDay ||
      !Array.isArray(data.versions)
    )
      throw new Error('Stale checkpoint')
    const catalog = parsePublicCatalog(data.catalog)
    const owners = new Map(catalog.map((agent) => [agent.id, agent.author.uid]))
    const files: PublicExport['files'] = new Map()
    for (const value of data.versions) {
      const manifest = manifestSchema.parse(value)
      const key = `${manifest.id}/${manifest.version}.json`
      if (
        files.has(key) ||
        manifest.visibility !== 'public' ||
        owners.get(manifest.id) !== manifest.author.uid
      )
        throw new Error('Invalid version inventory')
      files.set(key, manifest)
    }
    const skillIndex = parsePublicSkillIndex(data.skillIndex)
    const skillOwners = new Map(
      skillIndex.skills.map((entry) => [entry.id, entry.author.uid]),
    )
    const skillFiles: PublicExport['skillFiles'] = new Map()
    for (const value of data.skillVersions) {
      const skill = parsePublicSkillVersion(value, value.id, value.version)
      const path = skillVersionPath(skill.id, skill.version)
      if (
        skillOwners.get(skill.id) !== skill.author.uid ||
        skillFiles.has(path)
      )
        throw new Error('Invalid skill version inventory')
      skillFiles.set(path, skill)
    }
    if (
      skillIndex.skills.some(
        (entry) => !skillFiles.has(skillVersionPath(entry.id, entry.version)),
      )
    )
      throw new Error('Missing current skill version')
    const rawOrigins = data.origins
    let origins: Record<string, OriginApp> | undefined
    if (rawOrigins && typeof rawOrigins === 'object') {
      const parsed: Record<string, OriginApp> = {}
      for (const [key, app] of Object.entries(rawOrigins)) {
        if (
          typeof key === 'string' &&
          (app === 'claude' || app === 'chatgpt' || app === 'other')
        ) {
          parsed[key] = app
        }
      }
      origins = sortOrigins(parsed)
    }
    const result: PublicExport = {
      catalog,
      files,
      skillIndex,
      skillFiles,
      ...(origins !== undefined ? { origins } : {}),
    }
    if (live !== JSON.stringify({ sha256: exportDigest(result) }) + '\n')
      throw new Error('Hosting digest mismatch')
    return result
  } catch {
    console.error(
      'No valid current-day checkpoint matching Hosting; running full export.',
    )
    return undefined
  }
}
