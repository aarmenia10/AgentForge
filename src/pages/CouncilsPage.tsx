import { useEffect, useState } from 'react'
import { PageShell } from '@/components/PageShell'
import { inputClass, textLink } from '@/components/studio/parts'
import { queryCouncils } from '@/lib/councilSearch'
import { Link } from '@/router/Router'
import { publicCouncils } from '@/services/councilPublic'
import type { CouncilIndexEntry } from '@/types/council'

let cachedEntries: CouncilIndexEntry[] | null = null
let cachedSearch = ''

export default function CouncilsPage() {
  const [entries, setEntries] = useState<CouncilIndexEntry[] | null>(
    cachedEntries,
  )
  const [error, setError] = useState(false)
  const [search, setSearch] = useState(cachedSearch)
  useEffect(() => {
    let active = true
    publicCouncils
      .list()
      .then((items) => {
        cachedEntries = items
        if (active) setEntries(items)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [])
  const visible = entries ? queryCouncils(entries, search) : undefined
  return (
    <PageShell title="Councils">
      <div className="space-y-5">
        <p>
          Find teams of agents and skills with pinned versions, defined roles,
          and instructions for working together.
        </p>
        <label className="block max-w-lg space-y-1">
          <span>Search councils</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              cachedSearch = e.target.value
              setSearch(cachedSearch)
            }}
            className={inputClass() + ' h-10'}
          />
        </label>
        {error ? (
          <p role="alert">
            Could not load public councils. Reload to try again.
          </p>
        ) : !visible ? (
          <p role="status">Loading councils…</p>
        ) : !visible.length ? (
          <p>
            {entries?.length
              ? 'No councils match your search.'
              : 'No public councils yet.'}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {visible.map((council) => (
              <li
                key={council.id}
                className="min-w-0 space-y-2 rounded-3xl bg-surface p-6"
              >
                <Link
                  to={'/councils/' + council.id}
                  className={textLink + ' text-lg'}
                >
                  {council.name}
                </Link>
                <p>{council.description}</p>
                <p className="text-xs">
                  {council.member_count} members · @{council.author.handle} ·{' '}
                  {council.tags.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  )
}
