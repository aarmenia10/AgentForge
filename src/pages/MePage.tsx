import { useCallback, useState } from 'react'
import { MyCouncils } from '@/components/councils/MyCouncils'
import RequireAccount from '@/components/RequireAccount'
import { MyAgents } from '@/components/me/MyAgents'
import { SharedWithMe } from '@/components/me/SharedWithMe'
import {
  myItemsFilterHref,
  readMyItemsFilter,
  type MyItemsFilter,
} from '@/components/me/myItemsFilter'
import { FriendSkills } from '@/components/skills/FriendSkills'
import { MySkills } from '@/components/skills/MySkills'
import { primaryButton } from '@/components/studio/parts'
import { Link, useRoute } from '@/router/Router'

type ItemKind = Exclude<MyItemsFilter, 'all'>

type ItemCount = {
  count: number
  hasMore: boolean
  loading: boolean
}

const initialCount: ItemCount = { count: 0, hasMore: false, loading: true }

function countText(count: ItemCount) {
  if (count.loading && count.count === 0) return '…'
  return `${count.count}${count.hasMore ? '+' : ''}`
}

export default function MePage() {
  const { location, go } = useRoute()
  const selected = readMyItemsFilter(location.search)
  const [counts, setCounts] = useState<Record<ItemKind, ItemCount>>({
    agents: initialCount,
    skills: initialCount,
    councils: initialCount,
  })

  const updateCount = useCallback(
    (kind: ItemKind) => (count: number, hasMore: boolean, loading: boolean) => {
      setCounts((current) => ({
        ...current,
        [kind]: { count, hasMore, loading },
      }))
    },
    [],
  )

  const allCount: ItemCount = {
    count: counts.agents.count + counts.skills.count + counts.councils.count,
    hasMore:
      counts.agents.hasMore || counts.skills.hasMore || counts.councils.hasMore,
    loading:
      counts.agents.loading || counts.skills.loading || counts.councils.loading,
  }

  const filters: { value: MyItemsFilter; label: string; count: ItemCount }[] = [
    { value: 'all', label: 'All', count: allCount },
    { value: 'agents', label: 'Agents', count: counts.agents },
    { value: 'skills', label: 'Skills', count: counts.skills },
    { value: 'councils', label: 'Councils', count: counts.councils },
  ]

  function show(kind: MyItemsFilter) {
    go(myItemsFilterHref(kind))
  }

  return (
    <RequireAccount
      title="My items"
      purpose="Sign in to see the agents, skills, and councils you publish, and the ones friends share with you."
      reason="Sign in to see your agents, skills, and councils."
    >
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <h1
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight text-fg outline-none sm:text-4xl"
        >
          My items
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          Manage your agents, skills, and councils in one place.
        </p>

        <nav aria-label="Filter my items" className="mt-6 flex flex-wrap gap-2">
          {filters.map(({ value, label, count }) => {
            const active = selected === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => show(value)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-line bg-surface text-fg hover:bg-surface-2'
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active ? 'bg-black/10' : 'bg-surface-2'
                  }`}
                >
                  {countText(count)}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="mt-8 space-y-8">
          <section
            aria-labelledby="me-agents"
            hidden={selected !== 'all' && selected !== 'agents'}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-agents" className="text-lg font-semibold text-fg">
                Agents you made
              </h2>
              <Link to="/studio" className={primaryButton}>
                New agent
              </Link>
            </div>
            <MyAgents onCount={updateCount('agents')} />
          </section>

          <section
            aria-labelledby="me-skills"
            hidden={selected !== 'all' && selected !== 'skills'}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-skills" className="text-lg font-semibold text-fg">
                Skills you made
              </h2>
              <Link to="/skills/new" className={primaryButton}>
                New skill
              </Link>
            </div>
            <MySkills onCount={updateCount('skills')} />
          </section>

          <section
            aria-labelledby="me-councils"
            hidden={selected !== 'all' && selected !== 'councils'}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 id="me-councils" className="text-lg font-semibold text-fg">
                Your councils
              </h2>
              <Link to="/councils" className={primaryButton}>
                Browse councils
              </Link>
            </div>
            <MyCouncils onCount={updateCount('councils')} />
          </section>

          <section
            aria-labelledby="me-shared"
            className="space-y-3"
            hidden={selected !== 'all'}
          >
            <h2 id="me-shared" className="text-lg font-semibold text-fg">
              Shared with me
            </h2>
            <p className="text-fg-muted">
              Agents, skills, and councils your friends share with friends. Open
              a friend to see theirs.
            </p>
            <SharedWithMe
              friendExtra={(uid, name) => (
                <>
                  <FriendSkills uid={uid} name={name} />
                  <MyCouncils key={uid} owner={uid} />
                </>
              )}
            />
          </section>
        </div>
      </main>
    </RequireAccount>
  )
}
