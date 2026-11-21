import { emptyCouncilExport, type CouncilExport } from './councilExport'
import type { CouncilManifest } from '../src/types/council'
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { Firestore } from 'firebase-admin/firestore'
import { readCheckpoint, saveCheckpoint } from './catalogCheckpoint'
import { readFirestoreExport } from './catalogFirestore'
import { acknowledge } from './catalogChanges'
import { createHash } from 'node:crypto'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  validateCatalog,
  validateManifest,
  validateAgentRecord,
  manifestSchema,
} from '../src/lib/validateManifest'
import type { AgentManifest, AgentRecord } from '../src/types/agent'
import { emptySkillExport, type SkillExport } from './skillExport'
import {
  emptyRatingsExport,
  writeRatingsFiles,
  type RatingsExport,
  type RatingFile,
} from './ratingsExport'
import type { SkillManifest } from '../src/types/skill'
import type { OriginApp } from '../src/lib/portability'
import { parseAllowlist, unallowedFindings } from './catalogSafety'
import type { LinterAllowance } from './catalogSafety'

export interface ExportNotice {
  id: string
  reason: string
  findings?: { rule: string; path: string; severity: string }[]
}

/** Untrusted live records are isolated here; mergeCatalog retains its strict,
 * pure contract for existing consumers. Logs contain identifiers, never text. */
export function buildCatalog(
  seeds: readonly AgentManifest[],
  live: unknown[],
  allow: readonly LinterAllowance[] = [],
  log: (notice: ExportNotice) => void = () => {},
): AgentManifest[] {
  const safeSeeds = validateCatalog(seeds.map(validateManifest))
  for (const seed of safeSeeds) {
    const findings = unallowedFindings(seed, allow)
    if (findings.some((f) => f.severity === 'block'))
      throw new Error(
        `Blocked seed: ${seed.id} (${findings.map((f) => `${f.rule} ${f.path}`).join(', ')})`,
      )
    if (findings.length)
      log({
        id: seed.id,
        reason: 'warning',
        findings: findings.map(({ rule, path, severity }) => ({
          rule,
          path,
          severity,
        })),
      })
  }
  const seedIds = new Set(safeSeeds.map((s) => s.id))
  const excluded = new Set<string>()
  const records: AgentRecord[] = []
  const seen = new Set<string>()
  for (const value of live) {
    const id =
      value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string'
        ? value.id
        : '(unknown)'
    let record: AgentRecord
    try {
      record = validateAgentRecord(value)
    } catch {
      excluded.add(id)
      log({ id, reason: 'invalid' })
      continue
    }
    if (seen.has(id)) {
      excluded.add(id)
      log({ id, reason: 'duplicate' })
      continue
    }
    seen.add(id)
    if (seedIds.has(id) && record.owner_uid !== 'agentforge') {
      // Drop the live record only. The source seed stays in the catalog, so
      // nobody can remove a seed by claiming its id first.
      log({ id, reason: 'seed-id squatter' })
      continue
    }
    if (record.visibility !== 'public' || record.review_status !== 'approved') {
      excluded.add(id)
      continue
    }
    // Seed content always comes from source. Only its live counters are used.
    const seed = safeSeeds.find((s) => s.id === id)
    const content = seed
      ? {
          ...seed,
          stats: {
            ...seed.stats,
            stars: record.stats.stars,
            views: record.stats.views,
          },
        }
      : manifestSchema.strip().parse(record)
    const findings = unallowedFindings(content, allow)
    if (findings.length)
      log({
        id,
        reason: findings.some((f) => f.severity === 'block')
          ? 'blocked'
          : 'warning',
        findings: findings.map(({ rule, path, severity }) => ({
          rule,
          path,
          severity,
        })),
      })
    if (findings.some((f) => f.severity === 'block')) {
      excluded.add(id)
      continue
    }
    records.push({ ...record, ...content })
  }
  return mergeCatalog(
    safeSeeds.filter((s) => !excluded.has(s.id)),
    records.filter((r) => !excluded.has(r.id)),
  )
}

export function seedRecord(
  seed: AgentManifest,
  current?: AgentRecord,
): AgentRecord {
  return {
    ...seed,
    visibility: current?.visibility ?? seed.visibility,
    owner_uid: 'agentforge',
    review_status: current?.review_status ?? 'approved',
    shared_with: [],
    stats: {
      ...seed.stats,
      stars: current?.stats.stars ?? 0,
      views: current?.stats.views ?? 0,
    },
  }
}

export function mergeCatalog(
  seeds: readonly AgentManifest[],
  live: unknown[],
): AgentManifest[] {
  // Seeds are maintainer-approved manifests; live documents carry explicit review metadata.
  const records = new Map(
    validateCatalog(
      seeds
        .map(validateManifest)
        .filter((agent) => agent.visibility === 'public'),
    ).map((agent) => [agent.id, agent]),
  )
  const ids = new Set<string>()
  // Validate excluded documents too: malformed live data fails the build.
  for (const value of live) {
    const record = validateAgentRecord(value)
    if (ids.has(record.id)) throw new Error('Duplicate live id: ' + record.id)
    ids.add(record.id)
    if (record.visibility === 'public' && record.review_status === 'approved') {
      records.set(record.id, manifestSchema.strip().parse(record))
    } else {
      // A privacy or review change must also suppress a seed with the same id.
      records.delete(record.id)
    }
  }
  return validateCatalog([...records.values()]).sort((a, b) =>
    a.id.localeCompare(b.id, 'en'),
  )
}

export function buildVersionFiles(
  catalog: readonly AgentManifest[],
  snapshots: unknown[],
  seeds: readonly AgentManifest[] = [],
  allow: readonly LinterAllowance[] = [],
  log: (notice: ExportNotice) => void = () => {},
): Map<string, AgentManifest> {
  const eligible = new Map(catalog.map((agent) => [agent.id, agent]))
  const files = new Map<string, AgentManifest>()
  const versions = new Set<string>()
  for (const value of snapshots) {
    let snapshot: AgentRecord
    try {
      snapshot = validateAgentRecord(value)
    } catch {
      log({ id: '(snapshot)', reason: 'invalid' })
      continue
    }
    const key = `${snapshot.id}/${snapshot.version}.json`
    versions.add(key)
    const current = eligible.get(snapshot.id)
    if (!current || current.author.uid !== snapshot.owner_uid) continue
    const [manifest] = buildCatalog([], [snapshot], allow, log)
    if (manifest) files.set(key, manifest)
  }
  // Credential-free builds have source-approved seed snapshots too.
  for (const seed of seeds) {
    const key = `${seed.id}/${seed.version}.json`
    if (eligible.has(seed.id) && !versions.has(key)) {
      const [manifest] = buildCatalog([seed], [], allow, log)
      if (manifest) files.set(key, manifest)
    }
  }
  return files
}

export async function writeVersionFiles(
  directory: string,
  files: ReadonlyMap<string, AgentManifest | SkillManifest | CouncilManifest>,
) {
  // Regenerate only the dedicated output directory so removed agents and
  // blocked snapshots cannot survive from an earlier build.
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  for (const [path, manifest] of files) {
    const output = resolve(directory, path)
    await mkdir(resolve(output, '..'), { recursive: true })
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
}

export async function writeSkillFiles(publicDir: string, output: SkillExport) {
  await writeVersionFiles(
    resolve(publicDir, 'skills'),
    new Map(
      [...output.skillFiles].map(([path, skill]) => [
        decodeURIComponent(path.slice('skills/'.length)),
        skill,
      ]),
    ),
  )
  await writeFile(
    resolve(publicDir, 'skills.json'),
    JSON.stringify(output.skillIndex, null, 2) + '\n',
  )
}

export function sortOrigins(
  origins: Record<string, OriginApp>,
): Record<string, OriginApp> {
  const sorted: Record<string, OriginApp> = {}
  for (const key of Object.keys(origins).sort((a, b) =>
    a.localeCompare(b, 'en'),
  )) {
    sorted[key] = origins[key]
  }
  return sorted
}

export function buildOrigins(
  catalog: readonly AgentManifest[],
  snapshots: unknown[],
  allow: readonly LinterAllowance[] = [],
  log: (notice: ExportNotice) => void = () => {},
): Record<string, OriginApp> {
  const eligible = new Map(catalog.map((agent) => [agent.id, agent]))
  const origins: Record<string, OriginApp> = {}
  for (const value of snapshots) {
    let snapshot: AgentRecord
    try {
      snapshot = validateAgentRecord(value)
    } catch {
      continue
    }
    const current = eligible.get(snapshot.id)
    if (!current || current.author.uid !== snapshot.owner_uid) continue
    if (!snapshot.origin_app) continue
    const [manifest] = buildCatalog([], [snapshot], allow, log)
    if (manifest) {
      origins[`${snapshot.id}@${snapshot.version}`] = snapshot.origin_app
    }
  }
  return sortOrigins(origins)
}

export interface PublicExport
  extends SkillExport, CouncilExport, RatingsExport {
  catalog: AgentManifest[]
  files: Map<string, AgentManifest>
  origins?: Record<string, OriginApp>
}

export function exportDigest({
  catalog,
  files,
  skillIndex,
  skillFiles,
  councilIndex,
  councilFiles,
  origins,
  ratingsFiles,
}: PublicExport) {
  const digest = createHash('sha256').update(JSON.stringify(catalog))
  for (const [path, manifest] of [...files].sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  ))
    digest.update(path).update(JSON.stringify(manifest))
  digest.update('skills.json').update(JSON.stringify(skillIndex))
  for (const [path, skill] of [...skillFiles].sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  ))
    digest.update(path).update(JSON.stringify(skill))
  for (const [path, rating] of [...(ratingsFiles ?? new Map())].sort(
    ([a], [b]) => a.localeCompare(b, 'en'),
  ))
    digest.update(path).update(JSON.stringify(rating))
  digest.update('councils.json').update(JSON.stringify(councilIndex))
  for (const [path, council] of [...councilFiles].sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  ))
    digest.update(path).update(JSON.stringify(council))
  digest
    .update('origins.json')
    .update(JSON.stringify(sortOrigins(origins ?? {})))
  return digest.digest('hex')
}

async function withFirestore<T>(
  run: (db: Firestore) => Promise<T>,
): Promise<T | undefined> {
  if (process.env.AGENTLEMON_CATALOG_SOURCE === 'seed') return undefined
  const { applicationDefault, initializeApp, deleteApp } =
    await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  const explicit = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    emulator ||
    process.env.AGENTLEMON_CATALOG_SOURCE === 'firestore',
  )
  const credential = applicationDefault()
  if (!emulator) {
    try {
      await credential.getAccessToken()
    } catch (error) {
      if (explicit)
        throw new Error('Configured Firestore credentials are unavailable', {
          cause: error,
        })
      console.error(
        'No Application Default Credentials found; exporting approved public seeds only.',
      )
      return undefined
    }
  }
  const app = initializeApp(
    {
      credential,
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    },
    'catalog-export',
  )
  try {
    return await run(getFirestore(app))
  } finally {
    await deleteApp(app)
  }
}

export async function exportCatalog() {
  const allow = parseAllowlist(
    JSON.parse(
      await readFile(
        new URL('../safety-linter-allow.json', import.meta.url),
        'utf8',
      ),
    ),
  )
  const log = (notice: ExportNotice) => console.error(JSON.stringify(notice))
  // Fail on bad source seeds before making any Firestore writes.
  const seeds = buildCatalog(SEED_AGENTS, [], allow, log)
  const result = await withFirestore(async (db) => {
    const path = process.env.CATALOG_CHECKPOINT
    const previous = path
      ? await readCheckpoint(path, process.env.CATALOG_LIVE_STATE)
      : undefined
    const result = await readFirestoreExport(
      db,
      SEED_AGENTS,
      allow,
      log,
      previous,
    )
    if (path) await saveCheckpoint(path, result)
    if (process.env.CATALOG_RECEIPTS)
      await writeFile(
        process.env.CATALOG_RECEIPTS,
        JSON.stringify(result.receipts),
      )
    return result
  })
  const seedRatings = new Map<string, RatingFile>()
  for (const seed of seeds) {
    seedRatings.set(`ratings/agent/${seed.id}.json`, {
      kind: 'agent',
      id: seed.id,
      thumbs_up: seed.stats.stars,
      thumbs_down: 0,
      comments: [],
    })
  }
  const output = result ?? {
    ...emptySkillExport(),
    ...emptyCouncilExport(),
    ...emptyRatingsExport(),
    ratingsFiles: seedRatings,
    catalog: seeds,
    files: buildVersionFiles(seeds, [], SEED_AGENTS, allow, log),
    origins: {},
  }
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  await mkdir(publicDir, { recursive: true })
  await writeVersionFiles(resolve(publicDir, 'agents'), output.files)
  await writeSkillFiles(publicDir, output)
  await writeRatingsFiles(publicDir, output)
  await writeVersionFiles(
    resolve(publicDir, 'councils'),
    new Map(
      [...output.councilFiles].map(([path, council]) => [
        decodeURIComponent(path.slice('councils/'.length)),
        council,
      ]),
    ),
  )
  await writeFile(
    resolve(publicDir, 'councils.json'),
    JSON.stringify(output.councilIndex, null, 2) + '\n',
  )
  await writeFile(
    resolve(publicDir, 'origins.json'),
    `${JSON.stringify(sortOrigins(output.origins ?? {}), null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    resolve(publicDir, 'export-state.json'),
    JSON.stringify({ sha256: exportDigest(output) }) + '\n',
  )
  const catalogPath = resolve(publicDir, 'catalog.json')
  const temporary = `${catalogPath}.${process.pid}.tmp`
  await writeFile(
    temporary,
    `${JSON.stringify(output.catalog, null, 2)}\n`,
    'utf8',
  )
  await rename(temporary, catalogPath)
  console.error(
    `Exported ${output.catalog.length} approved public agents to public/catalog.json`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const run =
    process.argv[2] === '--acknowledge'
      ? withFirestore(async (db) =>
          acknowledge(
            db,
            JSON.parse(await readFile(process.env.CATALOG_RECEIPTS!, 'utf8')),
          ),
        )
      : exportCatalog()
  run.catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Catalog export failed',
    )
    process.exitCode = 1
  })
}
