import { displayAuthorHandle } from '@/lib/authorBranding'
import { Plus } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { agentRepository } from '@/lib/agentRepository'
import {
  filterCandidates,
  hasMember,
  pinCandidate,
  type DraftMember,
  type MemberCandidate,
} from '@/lib/councilBuilder'
import { skillRepository } from '@/lib/skillRepository'
import { listMyAgents } from '@/services/agents'
import { listMySkills } from '@/services/skills'
import { builderInput, pillButton } from './builderParts'

const PAGE = 20
/** At most this many pages of each kind: 200 items is plenty to pick from. */
const MAX_PAGES = 10

type Load = 'loading' | 'ready' | 'error'

/** Every agent and skill the signed-in user saved, at its current version. */
async function loadMine(): Promise<MemberCandidate[]> {
  const found: MemberCandidate[] = []
  const pageThrough = async (
    kind: MemberCandidate['kind'],
    list: (after?: string) => Promise<{
      items: {
        id: string
        name: string
        version: string
        description: string
      }[]
      cursor: string | null
    }>,
  ) => {
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await list(after)
      for (const { id, name, version, description } of page.items)
        found.push({ kind, id, name, version, description, source: 'mine' })
      if (!page.cursor || page.items.length < PAGE) break
      after = page.cursor
    }
  }
  await Promise.all([
    pageThrough('agent', (after) => listMyAgents(PAGE, after)),
    pageThrough('skill', (after) => listMySkills(PAGE, after)),
  ])
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** Public agents and skills from catalog.json and skills.json. */
async function loadPublic(): Promise<MemberCandidate[]> {
  const [agents, skills] = await Promise.all([
    agentRepository.listAgents(),
    skillRepository.listSkills(),
  ])
  return [
    ...agents.map((agent): MemberCandidate => ({
      kind: 'agent',
      id: agent.id,
      version: agent.version,
      name: agent.name,
      description: agent.description,
      source: 'public',
      handle: displayAuthorHandle(agent.author.handle),
    })),
    ...skills.skills.map((skill): MemberCandidate => ({
      kind: 'skill',
      id: skill.id,
      version: skill.version,
      name: skill.name,
      description: skill.description,
      source: 'public',
      handle: displayAuthorHandle(skill.author.handle),
    })),
  ]
}

function Row({
  candidate,
  added,
  full,
  onAdd,
}: {
  candidate: MemberCandidate
  added: boolean
  full: boolean
  onAdd: (candidate: MemberCandidate) => void
}) {
  const pin = pinCandidate(candidate)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-3xl bg-surface p-4">
      <div className="min-w-0">
        <p className="break-words font-medium">{candidate.name}</p>
        <p className="break-all font-mono text-xs text-fg-muted">
          {pin.kind} · {pin.id}@{pin.version}
          {candidate.handle ? ` · @${candidate.handle}` : ''}
        </p>
      </div>
      {/* aria-disabled, not disabled: the button the person just pressed
          keeps keyboard focus instead of dropping it to the page. */}
      <button
        type="button"
        className={
          pillButton +
          ' aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:translate-y-0'
        }
        aria-disabled={added || full}
        aria-label={`${added ? 'Already added' : 'Add'} ${candidate.name}`}
        onClick={() => !added && !full && onAdd(candidate)}
      >
        {added ? (
          'Added'
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </>
        )}
      </button>
    </li>
  )
}

/**
 * Where members come from: the person's own saved agents and skills, then a
 * search over the public ones. Adding pins the item's current version.
 */
export function BuilderMemberPicker({
  members,
  full,
  onAdd,
}: {
  members: readonly DraftMember[]
  full: boolean
  onAdd: (candidate: MemberCandidate) => void
}) {
  const ids = useId()
  const [mine, setMine] = useState<MemberCandidate[]>([])
  const [mineState, setMineState] = useState<Load>('loading')
  const [mineFilter, setMineFilter] = useState('')
  const [search, setSearch] = useState('')
  const [pub, setPub] = useState<MemberCandidate[] | null>(null)
  const [pubState, setPubState] = useState<Load>('ready')

  useEffect(() => {
    let active = true
    loadMine()
      .then((items) => {
        if (!active) return
        setMine(items)
        setMineState('ready')
      })
      .catch(() => active && setMineState('error'))
    return () => {
      active = false
    }
  }, [])

  // The public files are fetched when the person first types a search.
  const wantsPublic = search.trim().length > 0
  useEffect(() => {
    if (!wantsPublic || pub) return
    let active = true
    setPubState('loading')
    loadPublic()
      .then((items) => {
        if (!active) return
        setPub(items)
        setPubState('ready')
      })
      .catch(() => active && setPubState('error'))
    return () => {
      active = false
    }
  }, [wantsPublic, pub])

  const mineShown = useMemo(
    () => filterCandidates(mine, mineFilter, 100),
    [mine, mineFilter],
  )
  const pubShown = useMemo(
    () => (pub && wantsPublic ? filterCandidates(pub, search, 8) : []),
    [pub, search, wantsPublic],
  )

  return (
    <div className="space-y-6">
      <section aria-labelledby={`${ids}-mine`} className="space-y-3">
        <h4 id={`${ids}-mine`} className="text-sm font-semibold">
          Your agents and skills
        </h4>
        {mineState === 'loading' && (
          <p role="status" className="text-sm text-fg-muted">
            Loading your items…
          </p>
        )}
        {mineState === 'error' && (
          <p role="alert" className="text-sm text-fg">
            Could not load your agents and skills. You can still search the
            public ones below.
          </p>
        )}
        {mineState === 'ready' && !mine.length && (
          <p className="text-sm text-fg-muted">
            You have not saved an agent or skill yet. Search the public ones
            below.
          </p>
        )}
        {mine.length > 6 && (
          <div>
            <label htmlFor={`${ids}-filter`} className="sr-only">
              Filter your agents and skills
            </label>
            <input
              id={`${ids}-filter`}
              type="search"
              value={mineFilter}
              onChange={(e) => setMineFilter(e.target.value)}
              placeholder="Filter your items"
              className={builderInput() + ' h-11'}
            />
          </div>
        )}
        {mineShown.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {mineShown.map((candidate) => (
              <Row
                key={`${candidate.kind}:${candidate.id}`}
                candidate={candidate}
                added={hasMember(members, pinCandidate(candidate))}
                full={full}
                onAdd={onAdd}
              />
            ))}
          </ul>
        )}
        {mine.length > 0 && !mineShown.length && (
          <p className="text-sm text-fg-muted">Nothing matches that filter.</p>
        )}
      </section>

      <section aria-labelledby={`${ids}-public`} className="space-y-3">
        <h4 id={`${ids}-public`} className="text-sm font-semibold">
          Public agents and skills
        </h4>
        <div>
          <label htmlFor={`${ids}-search`} className="sr-only">
            Search public agents and skills
          </label>
          <input
            id={`${ids}-search`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search public agents and skills"
            className={builderInput() + ' h-11'}
          />
        </div>
        {pubState === 'loading' && (
          <p role="status" className="text-sm text-fg-muted">
            Searching…
          </p>
        )}
        {pubState === 'error' && (
          <p role="alert" className="text-sm text-fg">
            Could not load the public catalog. Try again in a moment.
          </p>
        )}
        {pubState === 'ready' && wantsPublic && pub && !pubShown.length && (
          <p className="text-sm text-fg-muted">
            No public match for that search.
          </p>
        )}
        {pubShown.length > 0 && (
          <ul className="space-y-2" aria-label="Public search results">
            {pubShown.map((candidate) => (
              <Row
                key={`${candidate.kind}:${candidate.id}`}
                candidate={candidate}
                added={hasMember(members, pinCandidate(candidate))}
                full={full}
                onAdd={onAdd}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
