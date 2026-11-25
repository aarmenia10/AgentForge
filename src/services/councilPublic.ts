import {
  councilVersionPath,
  parsePublicCouncilIndex,
  parsePublicCouncilVersion,
} from '../lib/councilSchema'
import { manifestSchema, parsePublicCatalog } from '../lib/manifestSchema'
import {
  parsePublicSkillIndex,
  parsePublicSkillVersion,
  skillVersionPath,
} from '../lib/skillSchema'
import type { AgentManifest } from '../types/agent'
import type { ItemRef, SkillManifest } from '../types/skill'

export type CouncilItem =
  | { kind: 'agent'; item: AgentManifest }
  | { kind: 'skill'; item: SkillManifest }
type Read = (path: string) => Promise<unknown>

/**
 * The council (or the requested version of it) is not in the public files.
 * Readers turn this into a message that names where private items live.
 */
export class CouncilNotPublic extends Error {
  constructor(
    readonly id: string,
    readonly version?: { requested: string; current: string },
  ) {
    super('Council is unavailable.')
    this.name = 'CouncilNotPublic'
  }
}

export function createPublicCouncilReader(read: Read) {
  const index = async () =>
    parsePublicCouncilIndex(await read('councils.json')).councils

  async function membership(refs: readonly ItemRef[]) {
    const [agents, skills] = await Promise.all([
      refs.some(({ kind }) => kind === 'agent')
        ? read('catalog.json').then(parsePublicCatalog)
        : [],
      refs.some(({ kind }) => kind === 'skill')
        ? read('skills.json')
            .then(parsePublicSkillIndex)
            .then(({ skills }) => skills)
        : [],
    ])
    const owners = {
      agent: new Map(
        agents
          .filter((item) => item.visibility === 'public')
          .map(({ id, author }) => [id, author.uid]),
      ),
      skill: new Map(skills.map(({ id, author }) => [id, author.uid])),
    }
    return (ref: ItemRef) => owners[ref.kind].get(ref.id)
  }

  async function resolveItem(
    ref: ItemRef,
    owner: string | undefined,
  ): Promise<CouncilItem> {
    const { id, version, kind } = ref
    if (owner) {
      if (kind === 'agent') {
        const path = [
          'agents',
          encodeURIComponent(id),
          encodeURIComponent(version) + '.json',
        ].join('/')
        const item = manifestSchema.parse(await read(path))
        if (
          item.id === id &&
          item.version === version &&
          item.visibility === 'public' &&
          item.author.uid === owner
        )
          return { kind, item }
      } else {
        const item = parsePublicSkillVersion(
          await read(skillVersionPath(id, version)),
          id,
          version,
        )
        if (item.author.uid === owner) return { kind, item }
      }
    }
    throw new Error(
      'Council member unavailable: ' + kind + ':' + id + '@' + version,
    )
  }

  return {
    async list() {
      const entries = await index()
      const owner = await membership(
        entries.flatMap((entry) => entry.members.map(({ ref }) => ref)),
      )
      return entries.filter((entry) =>
        entry.members.every(({ ref }) => owner(ref)),
      )
    },
    async member(ref: ItemRef) {
      return resolveItem(ref, (await membership([ref]))(ref))
    },
    async get(id: string, version?: string) {
      const current = (await index()).find((entry) => entry.id === id)
      if (!current) throw new CouncilNotPublic(id)
      const pin = version ?? current.version
      const load = (v: string) =>
        read(councilVersionPath(id, v)).then(
          (value) => parsePublicCouncilVersion(value, id, v),
          (error: unknown) => {
            // A hosted reader reports an absent file as PublicFileMissing.
            if (error instanceof Error && error.name === 'PublicFileMissing')
              throw new CouncilNotPublic(id, {
                requested: v,
                current: current.version,
              })
            throw error
          },
        )
      const council = await load(pin)
      if (council.author.uid !== current.author.uid)
        throw new Error('Council author mismatch.')
      const refs = council.members.map(({ ref }) => ref)
      const owner = await membership(refs)
      const items: CouncilItem[] = []
      for (let start = 0; start < refs.length; start += 4)
        items.push(
          ...(await Promise.all(
            refs
              .slice(start, start + 4)
              .map((ref) => resolveItem(ref, owner(ref))),
          )),
        )
      return { council, items }
    },
  }
}

export const publicCouncils = createPublicCouncilReader(async (path) => {
  const response = await fetch('/' + path, {
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Public item unavailable.')
  return response.json()
})
