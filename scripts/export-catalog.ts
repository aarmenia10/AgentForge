import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { SEED_AGENTS } from '../src/data/seedAgents'
import {
  validateCatalog,
  validateManifest,
  validateAgentRecord,
  manifestSchema,
} from '../src/lib/validateManifest'
import type { AgentManifest, AgentRecord } from '../src/types/agent'
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
      excluded.add(id)
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
    owner_uid: 'agentforge',
    review_status: 'approved',
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

async function readLiveRecords(
  log: (notice: ExportNotice) => void,
): Promise<unknown[]> {
  if (process.env.AGENTFORGE_CATALOG_SOURCE === 'seed') return []
  const { applicationDefault, initializeApp, deleteApp } =
    await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  const explicit = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    emulator ||
    process.env.AGENTFORGE_CATALOG_SOURCE === 'firestore',
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
      return []
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
    const db = getFirestore(app)
    const excluded = new Set<string>()
    for (const seed of SEED_AGENTS) {
      await db.runTransaction(async (tx) => {
        const ref = db.collection('agents').doc(seed.id)
        const snapshot = await tx.get(ref)
        const current = snapshot.data()
        if (current && current.owner_uid !== 'agentforge') {
          excluded.add(seed.id)
          log({ id: seed.id, reason: 'seed-id squatter' })
          return
        }
        let previous: AgentRecord | undefined
        if (current) {
          try {
            previous = validateAgentRecord(current)
          } catch {
            excluded.add(seed.id)
            log({ id: seed.id, reason: 'invalid seed live record' })
            return
          }
        }
        const next = seedRecord(seed, previous)
        if (!current) tx.set(ref, next)
        else if (!isDeepStrictEqual(current, next)) {
          const { stats, ...content } = next
          tx.update(ref, { ...content, 'stats.updated_at': stats.updated_at })
        }
      })
    }
    const snapshot = await db
      .collection('agents')
      .where('visibility', '==', 'public')
      .where('review_status', '==', 'approved')
      .get()
    const result: unknown[] = []
    for (const doc of snapshot.docs) {
      if (excluded.has(doc.id)) continue
      const value = doc.data()
      if (value.id !== doc.id) {
        excluded.add(doc.id)
        log({ id: doc.id, reason: 'document id mismatch' })
        continue
      }
      result.push(value)
    }
    // Suppress source seeds whose live id belongs to someone else or is invalid.
    for (const id of excluded) result.push({ id })
    return result
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
  buildCatalog(SEED_AGENTS, [], allow, log)
  const catalog = buildCatalog(
    SEED_AGENTS,
    await readLiveRecords(log),
    allow,
    log,
  )
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  await mkdir(publicDir, { recursive: true })
  const output = resolve(publicDir, 'catalog.json')
  const temporary = `${output}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  await rename(temporary, output)
  console.error(
    `Exported ${catalog.length} approved public agents to public/catalog.json`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  exportCatalog().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Catalog export failed',
    )
    process.exitCode = 1
  })
}
