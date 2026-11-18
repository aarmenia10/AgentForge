/**
 * Public skills, read from static files only (invariant 3): `skills.json` for
 * the list and `skills/<id>/<version>.json` for one version's text. No
 * Firestore code is reachable from here. docs/SKILLS.md section 7.
 */
import {
  parsePublicSkillIndex,
  parsePublicSkillVersion,
  skillVersionPath,
  utf8ByteLength,
} from './skillSchema'
import type { SkillIndexEntry, SkillManifest } from '../types/skill'

export interface SkillIndexResult {
  skills: SkillIndexEntry[]
  /**
   * `missing`: the site has no skills file yet (before the first export with
   * skills), shown as an empty list. `error`: the file exists but could not
   * be read or failed validation.
   */
  state: 'ready' | 'missing' | 'error'
}

export interface SkillRepository {
  listSkills(): Promise<SkillIndexResult>
  /** One exact version. Rejects when it is missing; never substitutes. */
  getSkillVersion(id: string, version: string): Promise<SkillManifest>
}

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'text'>>

const TIMEOUT_MS = 8000

function timeout(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(TIMEOUT_MS)
    : undefined
}

/** Hosting answers a missing path with the site's HTML page and status 200. */
function looksLikeHtml(body: string): boolean {
  return /^\s*</.test(body)
}

export function createSkillRepository(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  base = '/',
): SkillRepository {
  let index: Promise<SkillIndexResult> | undefined
  const versions = new Map<string, Promise<SkillManifest>>()

  async function readIndex(): Promise<SkillIndexResult> {
    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await fetchImpl(`${base}skills.json`, { signal: timeout() })
    } catch {
      return { skills: [], state: 'error' }
    }
    if (response.status === 404) return { skills: [], state: 'missing' }
    if (!response.ok) return { skills: [], state: 'error' }
    const body = await response.text().catch(() => '')
    if (looksLikeHtml(body)) return { skills: [], state: 'missing' }
    try {
      return {
        skills: parsePublicSkillIndex(JSON.parse(body)).skills,
        state: 'ready',
      }
    } catch {
      return { skills: [], state: 'error' }
    }
  }

  async function readVersion(
    id: string,
    version: string,
  ): Promise<SkillManifest> {
    const response = await fetchImpl(
      `${base}${skillVersionPath(id, version)}`,
      {
        signal: timeout(),
      },
    )
    if (!response.ok)
      throw new Error(`Skill/version not found: ${id}@${version}`)
    const body = await response.text()
    let value: unknown
    try {
      value = JSON.parse(body)
    } catch {
      throw new Error(`Skill/version not found: ${id}@${version}`)
    }
    return parsePublicSkillVersion(value, id, version)
  }

  return {
    listSkills() {
      if (!index) {
        index = readIndex().then((result) => {
          // Retry a failed read on the next visit rather than caching it.
          if (result.state === 'error') index = undefined
          return result
        })
      }
      return index.then((r) => ({ ...r, skills: structuredClone(r.skills) }))
    },
    getSkillVersion(id, version) {
      const key = `${id}@${version}`
      let pending = versions.get(key)
      if (!pending) {
        pending = readVersion(id, version)
        // Version files never change, so a success is kept for the session.
        pending.catch(() => versions.delete(key))
        versions.set(key, pending)
      }
      return pending.then((skill) => structuredClone(skill))
    },
  }
}

export const skillRepository: SkillRepository = createSkillRepository()

/* ---------- Search, shared by the skills page and its tests ---------- */

export type SkillSort = 'newest' | 'name'

export const SKILL_SORT_OPTIONS: readonly { key: SkillSort; label: string }[] =
  [
    { key: 'newest', label: 'Newest' },
    { key: 'name', label: 'A to Z' },
  ]

export interface SkillQuery {
  keyword: string
  tag: string | null
  sort: SkillSort
}

export const DEFAULT_SKILL_QUERY: SkillQuery = {
  keyword: '',
  tag: null,
  sort: 'newest',
}

function matches(skill: SkillIndexEntry, keyword: string): boolean {
  const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [
    skill.name,
    skill.id,
    skill.description,
    skill.author.name,
    skill.author.handle,
    ...skill.tags,
    ...skill.files.map((f) => f.path),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

/** Client-side filter and sort over the static index, like queryAgents. */
export function querySkills(
  skills: readonly SkillIndexEntry[],
  query: SkillQuery,
): SkillIndexEntry[] {
  const sorted = skills.filter(
    (s) =>
      (query.tag === null || s.tags.includes(query.tag)) &&
      matches(s, query.keyword),
  )
  return sorted.sort(
    query.sort === 'name'
      ? (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      : (a, b) =>
          Date.parse(b.stats.updated_at) - Date.parse(a.stats.updated_at),
  )
}

/** Total UTF-8 bytes of a skill's files, from the index or a full record. */
export function skillBytes(
  files: readonly ({ bytes: number } | { content: string })[],
): number {
  let total = 0
  for (const f of files)
    total += 'bytes' in f ? f.bytes : utf8ByteLength(f.content)
  return total
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
}
