import {
  councilVersionPath,
  parsePublicCouncilIndex,
  parsePublicCouncilVersion,
} from '../src/lib/councilSchema'
import { memberIsPublished } from './councilExport'
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
import { parseFeaturedSelection } from '../src/lib/featured'

const runDay = new Date().toISOString().slice(0, 10)
const scope = () =>
  [process.env.GOOGLE_CLOUD_PROJECT, process.env.GITHUB_SHA].join('/')

// The encrypted checkpoint also keeps the admin's selection so a catalog
// change can remove or restore a pick without rereading featured/current.
// Hosting's digest verifies the reconstructed public release.
export async function saveCheckpoint(path: string, result: PublicExport) {
  await writeFile(
    path,
    JSON.stringify({
      format: 5,
      featuredSelection: result.featuredSelection,
      councilIndex: result.councilIndex,
      councilVersions: [...result.councilFiles.values()],
      skillIndex: result.skillIndex,
      skillVersions: [...result.skillFiles.values()],
      scope: scope(),
      day: runDay,
      catalog: result.catalog,
      versions: [...result.files.values()],
      ...(result.origins !== undefined ? { origins: result.origins } : {}),
      ...(result.ratingsFiles !== undefined
        ? { ratings: [...result.ratingsFiles.entries()] }
        : {}),
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
      data.format !== 5 ||
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
    const rawSkills = data.skillIndex?.skills ?? []
    const parsedSkills = parsePublicSkillIndex(data.skillIndex)
    const skillIndex = {
      ...parsedSkills,
      skills: parsedSkills.skills.map((entry, i) => ({
        ...entry,
        ...(rawSkills[i]?.thumbs_up !== undefined
          ? { thumbs_up: rawSkills[i].thumbs_up }
          : {}),
        ...(rawSkills[i]?.thumbs_down !== undefined
          ? { thumbs_down: rawSkills[i].thumbs_down }
          : {}),
      })),
    }
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
    const options = {
      isMemberApproved: memberIsPublished({
        catalog,
        files,
        skillIndex,
        skillFiles,
      }),
    }
    const councilIndex = parsePublicCouncilIndex(data.councilIndex, options)
    const councilOwners = new Map(
      councilIndex.councils.map((entry) => [entry.id, entry.author.uid]),
    )
    const councilFiles: PublicExport['councilFiles'] = new Map()
    for (const value of data.councilVersions) {
      const council = parsePublicCouncilVersion(
        value,
        value.id,
        value.version,
        options,
      )
      const path = councilVersionPath(council.id, council.version)
      if (
        councilOwners.get(council.id) !== council.author.uid ||
        councilFiles.has(path)
      )
        throw new Error('Invalid council version inventory')
      councilFiles.set(path, council)
    }
    if (
      councilIndex.councils.some(
        ({ id, version }) => !councilFiles.has(councilVersionPath(id, version)),
      )
    )
      throw new Error('Missing current council version')
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
    const ratingsFiles: PublicExport['ratingsFiles'] | undefined =
      data.ratings !== undefined ? new Map(data.ratings) : undefined
    const result: PublicExport = {
      catalog,
      files,
      skillIndex,
      skillFiles,
      councilIndex,
      councilFiles,
      ...(data.featuredSelection !== undefined
        ? { featuredSelection: parseFeaturedSelection(data.featuredSelection) }
        : {}),
      ...(origins !== undefined ? { origins } : {}),
      ...(ratingsFiles !== undefined ? { ratingsFiles } : {}),
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
