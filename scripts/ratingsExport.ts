import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Firestore } from 'firebase-admin/firestore'
import type { AgentManifest } from '../src/types/agent'
import type { SkillIndex, SkillIndexEntry } from '../src/types/skill'
import { noBlockedWordsClient } from '../src/lib/blockedWords'
import type { Receipt } from './catalogChanges'
import type { ExportNotice } from './export-catalog'

/** Comments kept in each static ratings file (README decision, P3-13). */
export const COMMENTS_SHOWN = 50

export interface RatingComment {
  id: string
  author_handle: string
  body: string
  created_at: string
}

export interface RatingFile {
  kind: 'agent' | 'skill'
  id: string
  thumbs_up: number
  thumbs_down: number
  comments: RatingComment[]
}

export interface RatingsExport {
  ratingsFiles: Map<string, RatingFile>
}

export function emptyRatingsExport(): RatingsExport {
  return { ratingsFiles: new Map() }
}

function parseMarkerId(
  markerId: string,
): { kind: 'agent' | 'skill'; id: string } | null {
  if (markerId.startsWith('agents_')) {
    return { kind: 'agent', id: markerId.slice('agents_'.length) }
  }
  if (markerId.startsWith('skills_')) {
    return { kind: 'skill', id: markerId.slice('skills_'.length) }
  }
  return null
}

function toIsoString(timestamp: unknown): string {
  if (!timestamp) return new Date().toISOString()
  if (typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    return (timestamp as { toDate: () => Date }).toDate().toISOString()
  }
  if (
    typeof (timestamp as { toMillis?: () => number }).toMillis === 'function'
  ) {
    return new Date(
      (timestamp as { toMillis: () => number }).toMillis(),
    ).toISOString()
  }
  if (typeof timestamp === 'string') return timestamp
  return new Date().toISOString()
}

async function fetchItemRating(
  db: Firestore,
  kind: 'agent' | 'skill',
  item: AgentManifest | SkillIndexEntry,
  blockedWords: readonly string[],
  log: (n: ExportNotice) => void,
): Promise<RatingFile> {
  let thumbs_up: number
  let thumbs_down: number

  if (kind === 'agent') {
    thumbs_up = item.stats.stars
    // One aggregation read per 1,000 votes, not one read per vote document.
    const down = await db
      .collection('agents')
      .doc(item.id)
      .collection('votes')
      .where('value', '==', 'down')
      .count()
      .get()
    thumbs_down = down.data().count
  } else {
    const s = item as SkillIndexEntry & {
      thumbs_up?: number
      thumbs_down?: number
      stats?: { thumbs_up?: number; thumbs_down?: number }
    }
    thumbs_up = s.thumbs_up ?? s.stats?.thumbs_up ?? 0
    thumbs_down = s.thumbs_down ?? s.stats?.thumbs_down ?? 0
  }

  const commentsCol = db
    .collection(kind === 'agent' ? 'agents' : 'skills')
    .doc(item.id)
    .collection('comments')
  // The newest comments, so a busy item keeps showing new ones. They are
  // listed oldest first below.
  const commentsSnap = await commentsCol
    .where('deleted', '==', false)
    .orderBy('created_at', 'desc')
    .limit(COMMENTS_SHOWN)
    .get()

  const comments: RatingComment[] = []
  for (const doc of commentsSnap.docs) {
    const data = doc.data()
    const body = typeof data.body === 'string' ? data.body : ''
    if (!noBlockedWordsClient(body, blockedWords)) {
      log({ id: doc.id, reason: 'blocked-word comment' })
      continue
    }
    comments.push({
      id: doc.id,
      author_handle:
        typeof data.author_handle === 'string' ? data.author_handle : '',
      body,
      created_at: toIsoString(data.created_at),
    })
  }

  comments.reverse()

  return {
    kind,
    id: item.id,
    thumbs_up,
    thumbs_down,
    comments,
  }
}

export async function readRatingsExport(
  db: Firestore,
  catalog: readonly AgentManifest[],
  skillIndex: SkillIndex,
  voteChanges: Receipt[],
  commentChanges: Receipt[],
  blockedWords: readonly string[],
  log: (n: ExportNotice) => void,
  previous?: RatingsExport,
): Promise<RatingsExport> {
  const ratingsFiles = new Map(previous?.ratingsFiles)
  const agentById = new Map(catalog.map((a) => [a.id, a]))
  const skillById = new Map(skillIndex.skills.map((s) => [s.id, s]))

  // Withdraw stale rating files for items no longer published
  for (const [path, file] of ratingsFiles.entries()) {
    if (file.kind === 'agent' && !agentById.has(file.id)) {
      ratingsFiles.delete(path)
    } else if (file.kind === 'skill' && !skillById.has(file.id)) {
      ratingsFiles.delete(path)
    }
  }

  if (!previous) {
    // Full export
    for (const agent of catalog) {
      const rating = await fetchItemRating(
        db,
        'agent',
        agent,
        blockedWords,
        log,
      )
      ratingsFiles.set(`ratings/agent/${agent.id}.json`, rating)
    }
    for (const skill of skillIndex.skills) {
      const rating = await fetchItemRating(
        db,
        'skill',
        skill,
        blockedWords,
        log,
      )
      ratingsFiles.set(`ratings/skill/${skill.id}.json`, rating)
    }
    return { ratingsFiles }
  }

  // Incremental export: process changed markers and newly added catalog items
  const dirtyAgents = new Set<string>()
  const dirtySkills = new Set<string>()

  for (const receipt of [...voteChanges, ...commentChanges]) {
    const parsed = parseMarkerId(receipt.id)
    if (!parsed) continue
    if (parsed.kind === 'agent') dirtyAgents.add(parsed.id)
    else dirtySkills.add(parsed.id)
  }

  for (const agent of catalog) {
    const key = `ratings/agent/${agent.id}.json`
    const existing = ratingsFiles.get(key)
    if (!existing) {
      dirtyAgents.add(agent.id)
    } else if (existing.thumbs_up !== agent.stats.stars) {
      ratingsFiles.set(key, {
        ...existing,
        thumbs_up: agent.stats.stars,
      })
    }
  }
  for (const skill of skillIndex.skills) {
    const key = `ratings/skill/${skill.id}.json`
    const existing = ratingsFiles.get(key)
    const s = skill as SkillIndexEntry & {
      thumbs_up?: number
      thumbs_down?: number
      stats?: { thumbs_up?: number; thumbs_down?: number }
    }
    const up = s.thumbs_up ?? s.stats?.thumbs_up ?? 0
    const down = s.thumbs_down ?? s.stats?.thumbs_down ?? 0
    if (!existing) {
      dirtySkills.add(skill.id)
    } else if (existing.thumbs_up !== up || existing.thumbs_down !== down) {
      ratingsFiles.set(key, {
        ...existing,
        thumbs_up: up,
        thumbs_down: down,
      })
    }
  }

  for (const id of dirtyAgents) {
    const agent = agentById.get(id)
    if (!agent) {
      ratingsFiles.delete(`ratings/agent/${id}.json`)
      continue
    }
    const rating = await fetchItemRating(db, 'agent', agent, blockedWords, log)
    ratingsFiles.set(`ratings/agent/${id}.json`, rating)
  }

  for (const id of dirtySkills) {
    const skill = skillById.get(id)
    if (!skill) {
      ratingsFiles.delete(`ratings/skill/${id}.json`)
      continue
    }
    const rating = await fetchItemRating(db, 'skill', skill, blockedWords, log)
    ratingsFiles.set(`ratings/skill/${id}.json`, rating)
  }

  return { ratingsFiles }
}

export async function writeRatingsFiles(
  publicDir: string,
  exportData: RatingsExport,
): Promise<void> {
  const ratingsDir = resolve(publicDir, 'ratings')
  const agentDir = resolve(ratingsDir, 'agent')
  const skillDir = resolve(ratingsDir, 'skill')
  await mkdir(agentDir, { recursive: true })
  await mkdir(skillDir, { recursive: true })

  const validPaths = new Set<string>()
  for (const [relPath, rating] of exportData.ratingsFiles) {
    const filePath = resolve(publicDir, relPath)
    await mkdir(resolve(filePath, '..'), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(rating, null, 2)}\n`, 'utf8')
    validPaths.add(filePath)
  }

  // Clean up any stale files
  for (const [dir, kind] of [
    [agentDir, 'agent'],
    [skillDir, 'skill'],
  ] as const) {
    try {
      const files = await readdir(dir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const fullPath = resolve(dir, file)
        const id = file.slice(0, -'.json'.length)
        if (!exportData.ratingsFiles.has(`ratings/${kind}/${id}.json`)) {
          await rm(fullPath, { force: true })
        }
      }
    } catch {
      // directory might not exist yet
    }
  }
}
