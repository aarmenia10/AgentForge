import { readFile, writeFile } from 'node:fs/promises'
import { manifestSchema, parsePublicCatalog } from '../src/lib/manifestSchema'
import { exportDigest } from './export-catalog'
import type { PublicExport } from './export-catalog'

const runDay = new Date().toISOString().slice(0, 10)
const scope = () =>
  [process.env.GOOGLE_CLOUD_PROJECT, process.env.GITHUB_SHA].join('/')

// Only already-public files are cached. The live Hosting digest covers the
// entire reconstructed release, including version paths. A cache is disposable.
export async function saveCheckpoint(path: string, result: PublicExport) {
  await writeFile(
    path,
    JSON.stringify({
      format: 1,
      scope: scope(),
      day: runDay,
      catalog: result.catalog,
      versions: [...result.files.values()],
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
      data.format !== 1 ||
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
    const result = { catalog, files }
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
