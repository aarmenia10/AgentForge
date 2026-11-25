import { readCouncilExport } from './councilExport'
import { isDeepStrictEqual } from 'node:util'
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore'
import type { AgentManifest, AgentRecord } from '../src/types/agent'
import { validateAgentRecord, versionSchema } from '../src/lib/validateManifest'
import {
  buildCatalog,
  buildOrigins,
  buildVersionFiles,
  seedRecord,
  sortOrigins,
} from './export-catalog'
import type { ExportNotice, PublicExport } from './export-catalog'
import type { OriginApp } from '../src/lib/portability'
import type { LinterAllowance } from './catalogSafety'
import { readSkillExport } from './skillExport'
import { pendingChanges } from './catalogChanges'
import { readRatingsExport } from './ratingsExport'
import { getBlockedWordsSync } from '../src/lib/blockedWords'
import { parseFeaturedSelection } from '../src/lib/featured'

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
  const [
    agents,
    versions,
    skills,
    skillVersions,
    councils,
    councilVersions,
    votes,
    comments,
    featured,
  ] = await Promise.all([
    pendingChanges(db, 'agents'),
    pendingChanges(db, 'agent_versions'),
    pendingChanges(db, 'skills'),
    pendingChanges(db, 'skill_versions'),
    pendingChanges(db, 'councils'),
    pendingChanges(db, 'council_versions'),
    pendingChanges(db, 'votes'),
    pendingChanges(db, 'comments'),
    pendingChanges(db, 'featured'),
  ])
  const receipts = [
    ...agents,
    ...versions,
    ...skills,
    ...skillVersions,
    ...councils,
    ...councilVersions,
    ...votes,
    ...comments,
    ...featured,
  ]
  const featuredSelection =
    !previous || featured.some(({ id }) => id === 'current')
      ? parseFeaturedSelection((await db.doc('featured/current').get()).data())
      : previous.featuredSelection
  // A vote changes the live counters but writes only a `votes` marker, so the
  // marked item is refreshed here as well. Otherwise catalog.json and
  // skills.json would keep stale counts until the next full export.
  const votedIds = (kind: 'agents' | 'skills') =>
    votes
      .filter(({ id }) => id.startsWith(kind + '_'))
      .map((vote) => ({ ...vote, id: vote.id.slice(kind.length + 1) }))
  const skillExport = await readSkillExport(
    db,
    [...skills, ...votedIds('skills')],
    skillVersions,
    allow,
    log,
    previous,
  )
  async function complete(
    inventory: Pick<PublicExport, 'catalog' | 'files' | 'origins'>,
  ) {
    const output = { ...inventory, ...skillExport }
    return {
      ...output,
      ...(await readCouncilExport(
        db,
        output,
        councils,
        councilVersions,
        log,
        previous,
      )),
      ...(await readRatingsExport(
        db,
        output.catalog,
        output.skillIndex,
        votes,
        comments,
        getBlockedWordsSync(),
        log,
        previous,
      )),
      featuredSelection,
      receipts,
    }
  }
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
    return complete({
      catalog,
      files: buildVersionFiles(catalog, snapshots, seeds, allow, log),
      origins: buildOrigins(catalog, snapshots, allow, log),
    })
  }

  const catalog = new Map(previous.catalog.map((agent) => [agent.id, agent]))
  const files = new Map(previous.files)
  const origins: Record<string, OriginApp> = { ...(previous.origins ?? {}) }
  const seedById = new Map(seeds.map((seed) => [seed.id, seed]))
  const rebuiltHistory = new Set<string>()
  const changedAgents = new Set([
    ...agents.map(({ id }) => id),
    ...votedIds('agents').map(({ id }) => id),
  ])
  for (const id of changedAgents) {
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
      for (const key of Object.keys(origins))
        if (key.startsWith(id + '@')) delete origins[key]
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
        const agentOrigins = buildOrigins([after], rows, allow, log)
        Object.assign(origins, agentOrigins)
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
      const agentOrigins = buildOrigins(
        [after],
        [state.createdVersion],
        allow,
        log,
      )
      Object.assign(origins, agentOrigins)
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
    delete origins[`${id}@${version}`]
    for (const [path, manifest] of buildVersionFiles(
      [agent],
      value ? [value] : [],
      seed?.version === version ? [seed] : [],
      allow,
      log,
    ))
      files.set(path, manifest)
    if (value && agent) {
      const versionOrigins = buildOrigins([agent], [value], allow, log)
      Object.assign(origins, versionOrigins)
    }
  }
  for (const key of Object.keys(origins)) {
    const at = key.indexOf('@')
    const id = at > 0 ? key.slice(0, at) : key
    if (!catalog.has(id)) delete origins[key]
  }
  return complete({
    catalog: [...catalog.values()].sort((a, b) =>
      a.id.localeCompare(b.id, 'en'),
    ),
    files,
    origins: sortOrigins(origins),
  })
}
