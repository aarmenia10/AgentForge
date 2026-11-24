import { SearchX } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowIcon, primaryButtonClass } from '@/components/ui'
import { agentRepository } from '@/lib/agentRepository'
import { DEFAULT_QUERY, queryAgents } from '@/lib/catalog'
import { queryCouncils } from '@/lib/councilSearch'
import {
  DEFAULT_SKILL_QUERY,
  querySkills,
  skillRepository,
} from '@/lib/skillRepository'
import { Link, useRoute } from '@/router/Router'
import { publicCouncils } from '@/services/councilPublic'
import type { AgentManifest } from '@/types/agent'
import type { CouncilIndexEntry } from '@/types/council'
import type { SkillIndexEntry } from '@/types/skill'

type Load<T> =
  { state: 'loading' } | { state: 'error' } | { state: 'ready'; items: T[] }

/**
 * Loads the three public files once per page visit. `catalog.json`,
 * `skills.json`, and `councils.json` are static, so a search costs no
 * Firestore reads (invariant 3). One failing file does not hide the others.
 */
function useCatalogs() {
  const [agents, setAgents] = useState<Load<AgentManifest>>({
    state: 'loading',
  })
  const [skills, setSkills] = useState<Load<SkillIndexEntry>>({
    state: 'loading',
  })
  const [councils, setCouncils] = useState<Load<CouncilIndexEntry>>({
    state: 'loading',
  })
  useEffect(() => {
    let active = true
    agentRepository
      .listAgents()
      .then((items) => active && setAgents({ state: 'ready', items }))
      .catch(() => active && setAgents({ state: 'error' }))
    skillRepository
      .listSkills()
      .then(
        (result) =>
          active &&
          setSkills(
            result.state === 'error'
              ? { state: 'error' }
              : { state: 'ready', items: result.skills },
          ),
      )
      .catch(() => active && setSkills({ state: 'error' }))
    publicCouncils
      .list()
      .then((items) => active && setCouncils({ state: 'ready', items }))
      .catch(() => active && setCouncils({ state: 'error' }))
    return () => {
      active = false
    }
  }, [])
  return { agents, skills, councils }
}

export default function SearchPage() {
  const { location } = useRoute()
  const keyword = useMemo(
    () => (new URLSearchParams(location.search).get('q') ?? '').trim(),
    [location.search],
  )
  const { agents, skills, councils } = useCatalogs()

  const agentHits = useMemo(
    () =>
      agents.state === 'ready'
        ? queryAgents(agents.items, { ...DEFAULT_QUERY, keyword })
        : [],
    [agents, keyword],
  )
  const skillHits = useMemo(
    () =>
      skills.state === 'ready'
        ? querySkills(skills.items, { ...DEFAULT_SKILL_QUERY, keyword })
        : [],
    [skills, keyword],
  )
  const councilHits = useMemo(
    () =>
      councils.state === 'ready' ? queryCouncils(councils.items, keyword) : [],
    [councils, keyword],
  )

  const loading = [agents, skills, councils].some((l) => l.state === 'loading')
  const failed = [agents, skills, councils].some((l) => l.state === 'error')
  const total = agentHits.length + skillHits.length + councilHits.length

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <h1
        tabIndex={-1}
        className="break-words text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
      >
        {keyword ? (
          <>
            Results for <span className="text-accent-fg">“{keyword}”</span>
          </>
        ) : (
          'Search AgentLemon'
        )}
      </h1>

      {!keyword ? (
        <EmptyState title="Type something to search.">
          Use the search field at the top to look through agents, skills, and
          councils.
        </EmptyState>
      ) : (
        <>
          <p role="status" aria-live="polite" className="mt-3 text-fg-muted">
            {loading
              ? 'Searching…'
              : `${total} ${total === 1 ? 'result' : 'results'} across agents, skills, and councils.`}
          </p>

          {!loading && total === 0 && !failed ? (
            <EmptyState title={`Nothing matches “${keyword}”.`}>
              Try a shorter word, a tag such as coding or research, or browse
              everything.
            </EmptyState>
          ) : (
            <div className="mt-8 space-y-10">
              <Group
                title="Agents"
                browseTo="/agents"
                load={agents}
                count={agentHits.length}
              >
                {agentHits.map((agent) => (
                  <ResultCard
                    key={agent.id}
                    to={`/agents?agent=${encodeURIComponent(agent.id)}`}
                    kind="Agent"
                    name={agent.name}
                    version={agent.version}
                    description={agent.description}
                    meta={`@${agent.author.handle} · ${agent.tags.slice(0, 3).join(', ')}`}
                  />
                ))}
              </Group>
              <Group
                title="Skills"
                browseTo="/skills"
                load={skills}
                count={skillHits.length}
              >
                {skillHits.map((skill) => (
                  <ResultCard
                    key={skill.id}
                    to={`/skills/${encodeURIComponent(skill.id)}`}
                    kind="Skill"
                    name={skill.name}
                    version={skill.version}
                    description={skill.description}
                    meta={`@${skill.author.handle} · ${skill.tags.slice(0, 3).join(', ')}`}
                  />
                ))}
              </Group>
              <Group
                title="Councils"
                browseTo="/councils"
                load={councils}
                count={councilHits.length}
              >
                {councilHits.map((council) => (
                  <ResultCard
                    key={council.id}
                    to={`/councils/${encodeURIComponent(council.id)}`}
                    kind="Council"
                    name={council.name}
                    description={council.description}
                    meta={`${council.member_count} members · @${council.author.handle}`}
                  />
                ))}
              </Group>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function Group<T>({
  title,
  browseTo,
  load,
  count,
  children,
}: {
  title: string
  browseTo: string
  load: Load<T>
  count: number
  children: ReactNode
}) {
  const headingId = `search-${title.toLowerCase()}`
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          {title}
          {load.state === 'ready' && (
            <span className="ml-2 text-sm font-normal text-fg-muted">
              {count}
            </span>
          )}
        </h2>
        <Link
          to={browseTo}
          className="rounded-full text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Browse all {title.toLowerCase()}
        </Link>
      </div>
      {load.state === 'loading' && (
        <div
          aria-busy="true"
          className="h-20 animate-pulse rounded-3xl bg-surface"
        />
      )}
      {load.state === 'error' && (
        <p role="alert" className="rounded-3xl bg-surface p-5 text-sm">
          Could not load {title.toLowerCase()}. Reload to try again.
        </p>
      )}
      {load.state === 'ready' &&
        (count === 0 ? (
          <p className="rounded-3xl bg-surface p-5 text-sm text-fg-muted">
            No {title.toLowerCase()} match.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">{children}</ul>
        ))}
    </section>
  )
}

function ResultCard({
  to,
  kind,
  name,
  version,
  description,
  meta,
}: {
  to: string
  kind: string
  name: string
  version?: string
  description: string
  meta: string
}) {
  return (
    <li className="min-w-0">
      <article className="card-lift relative flex h-full flex-col rounded-3xl bg-surface p-5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg">
          {kind}
        </p>
        <h3 className="mt-2 break-words text-lg font-semibold tracking-tight">
          {/* The stretched link makes the whole card one click target. */}
          <Link
            to={to}
            className="after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--lm-accent-text)]"
          >
            {name}
          </Link>
          {version && (
            <span className="ml-2 font-mono text-xs font-normal text-fg-muted">
              v{version}
            </span>
          )}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg-muted">
          {description}
        </p>
        <p className="mt-auto truncate pt-3 text-xs text-fg-muted">{meta}</p>
      </article>
    </li>
  )
}

function EmptyState({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="mt-8 rounded-3xl bg-surface p-8 text-center sm:p-12">
      <SearchX className="mx-auto size-8 text-fg-muted" aria-hidden="true" />
      <p className="mt-3 break-words text-lg font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{children}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {[
          ['/agents', 'Browse Agents'],
          ['/skills', 'Browse Skills'],
          ['/councils', 'Browse Councils'],
        ].map(([to, label]) => (
          <Link key={to} to={to} className={primaryButtonClass}>
            {label}
            <ArrowIcon />
          </Link>
        ))}
      </div>
    </div>
  )
}
