import { isDeepStrictEqual } from 'node:util'
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type { AgentManifest, AgentRecord } from '../src/types/agent'
import { validateAgentRecord, versionSchema } from '../src/lib/validateManifest'
import { buildCatalog, buildVersionFiles, seedRecord } from './export-catalog'
import type { ExportNotice, PublicExport } from './export-catalog'
import type { LinterAllowance } from './catalogSafety'
import { readSkillExport } from './skillExport'
import { pendingChanges } from './catalogChanges'

type Log = (notice: ExportNotice) => void

function frozenContent(record: AgentRecord) {
  return {
    ...record,
    stats: { ...record.stats, stars: 0, views: 0 },
    visibility: 'public',
    review_status: 'approved',
  }
}

// Return the committed attempt's state. Firestore may rerun this callback.
async function provisionSeed(
  db: Firestore,
  seed: AgentManifest,
  full: boolean,
  log: Log,
) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('agents').doc(seed.id)
    const doc = await tx.get(ref)
    const current = doc.data()
    if (current && current.owner_uid !== 'agentforge') {
      log({ id: seed.id, reason: 'seed-id squatter' })
      return {}
    }
    let previous: AgentRecord | undefined
    if (current) {
      try {
        previous = validateAgentRecord(current)
      } catch {
        log({ id: seed.id, reason: 'invalid seed live record' })
        return {}
      }
    }
    const next = seedRecord(seed, previous)
    if (!full && isDeepStrictEqual(current, next)) return { live: next }
    const versionRef = db
      .collection('agent_versions')
      .doc(`${seed.id}@${seed.version}`)
    const version = await tx.get(versionRef)
    const approved = {
      ...next,
      visibility: 'public',
      review_status: 'approved',
    }
    if (version.exists) {
      if (
        !isDeepStrictEqual(
          frozenContent(validateAgentRecord(version.data())),
          frozenContent(next),
        )
      )
        throw new Error(
          `Seed version content changed: ${seed.id}@${seed.version}`,
        )
    } else tx.create(versionRef, approved)
    if (!current) tx.set(ref, next)
    else if (!isDeepStrictEqual(current, next)) {
      const { stats, ...content } = next
      tx.update(ref, { ...content, 'stats.updated_at': stats.updated_at })
    }
    return { live: next, createdVersion: version.exists ? undefined : approved }
  })
}

function recordData(doc: DocumentSnapshot, version: boolean, log: Log) {
  const value = doc.data()
  if (!value) return undefined
  if (doc.id === (version ? `${value.id}@${value.version}` : value.id))
    return value
  log({
    id: doc.id,
    reason: version ? 'snapshot document id mismatch' : 'document id mismatch',
  })
}

export async function readFirestoreExport(
  db: Firestore,
  seeds: readonly AgentManifest[],
  allow: readonly LinterAllowance[],
  log: Log,
  previous?: PublicExport,
) {
  // Capture receipts BEFORE reading data. Writes during a run are either
  // reflected here or remain queued for the next successful publication.
  const [agents, versions, skills, skillVersions] = await Promise.all([
    pendingChanges(db, 'agents'),
    pendingChanges(db, 'agent_versions'),
    pendingChanges(db, 'skills'),
    pendingChanges(db, 'skill_versions'),
  ])
  const receipts = [...agents, ...versions, ...skills, ...skillVersions]
  const skillExport = await readSkillExport(
    db,
    skills,
    skillVersions,
    allow,
    log,
    previous,
  )
  if (!previous) {
    const live = new Map<string, unknown>()
    const excluded = new Set<string>()
    for (const seed of seeds) {
      const { live: record } = await provisionSeed(db, seed, true, log)
      if (record) live.set(seed.id, record)
      else excluded.add(seed.id)
    }
    const current = await db
      .collection('agents')
      .where('visibility', '==', 'public')
      .where('review_status', '==', 'approved')
      .get()
    for (const doc of current.docs) {
      const value = recordData(doc, false, log)
      if (value && !excluded.has(doc.id)) live.set(doc.id, value)
    }
    const catalog = buildCatalog(seeds, [...live.values()], allow, log)
    const history = await db.collection('agent_versions').get()
    const snapshots = history.docs
      .map((doc) => recordData(doc, true, log))
      .filter(Boolean)
    return {
      catalog,
      files: buildVersionFiles(catalog, snapshots, seeds, allow, log),
      ...skillExport,
      receipts,
    }
  }

  const catalog = new Map(previous.catalog.map((agent) => [agent.id, agent]))
  const files = new Map(previous.files)
  const seedById = new Map(seeds.map((seed) => [seed.id, seed]))
  const rebuiltHistory = new Set<string>()
  for (const { id } of agents) {
    const seed = seedById.get(id)
    const before = catalog.get(id)
    const state = seed
      ? await provisionSeed(db, seed, false, log)
      : {
          live: recordData(
            await db.collection('agents').doc(id).get(),
            false,
            log,
          ),
        }
    const [after] = buildCatalog(
      seed ? [seed] : [],
      state.live ? [state.live] : [],
      allow,
      log,
    )
    if (after) catalog.set(id, after)
    else catalog.delete(id)
    if (before?.author.uid !== after?.author.uid) {
      // Losing membership withdraws every pin. Regaining it (or changing
      // owner) requires history for just this id, including pre-marker pins.
      for (const key of files.keys())
        if (key.startsWith(id + '/')) files.delete(key)
      if (after) {
        const history = await db
          .collection('agent_versions')
          .where('id', '==', id)
          .get()
        const rows = history.docs
          .map((doc) => recordData(doc, true, log))
          .filter(Boolean)
        for (const [key, manifest] of buildVersionFiles(
          [after],
          rows,
          seed ? [seed] : [],
          allow,
          log,
        ))
          files.set(key, manifest)
      }
      rebuiltHistory.add(id)
    } else if (after && 'createdVersion' in state && state.createdVersion) {
      for (const [key, manifest] of buildVersionFiles(
        [after],
        [state.createdVersion],
        [],
        allow,
        log,
      ))
        files.set(key, manifest)
    }
  }

  for (const change of versions) {
    const separator = change.id.indexOf('@')
    const id = change.id.slice(0, separator)
    const version = change.id.slice(separator + 1)
    if (separator < 1 || !versionSchema.safeParse(version).success) {
      log({ id: change.id, reason: 'invalid snapshot document id' })
      continue
    }
    const agent = catalog.get(id)
    if (!agent || rebuiltHistory.has(id)) continue
    const doc = await db.collection('agent_versions').doc(change.id).get()
    const value = recordData(doc, true, log)
    const seed = seedById.get(id)
    const key = `${id}/${version}.json`
    files.delete(key)
    for (const [path, manifest] of buildVersionFiles(
      [agent],
      value ? [value] : [],
      seed?.version === version ? [seed] : [],
      allow,
      log,
    ))
      files.set(path, manifest)
  }
  return {
    catalog: [...catalog.values()].sort((a, b) =>
      a.id.localeCompare(b.id, 'en'),
    ),
    files,
    ...skillExport,
    receipts,
  }
}
