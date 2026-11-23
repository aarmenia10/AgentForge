import { Search, SearchX, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { primaryButton } from '@/components/studio/parts'
import { SkillCard } from '@/components/skills/SkillCard'
import { cn } from '@/components/ui'
import {
  DEFAULT_SKILL_QUERY,
  querySkills,
  skillRepository,
  SKILL_SORT_OPTIONS,
  type SkillIndexResult,
  type SkillQuery,
} from '@/lib/skillRepository'
import { Link } from '@/router/Router'
import { AGENT_CATEGORIES } from '@/types/agent'

// Kept for the session, so returning to the page shows the list at once.
let cachedIndex: SkillIndexResult | null = null
let cachedQuery: SkillQuery = DEFAULT_SKILL_QUERY

const fieldClass =
  'h-10 rounded-xl border border-slate-200 bg-white/70 px-3 text-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-white/5'
const gridClass = 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3'

/** Public skills from the static skills.json. No database reads. */
export default function SkillsPage() {
  const [index, setIndex] = useState<SkillIndexResult | null>(cachedIndex)
  const [query, setQuery] = useState<SkillQuery>(cachedQuery)

  useEffect(() => {
    let active = true
    skillRepository.listSkills().then((result) => {
      if (result.state !== 'error') cachedIndex = result
      if (active) setIndex(result)
    })
    return () => {
      active = false
    }
  }, [])

  function patch(change: Partial<SkillQuery>) {
    setQuery((current) => {
      cachedQuery = { ...current, ...change }
      return cachedQuery
    })
  }
  const reset = () => patch({ keyword: '', tag: null })

  const visible = useMemo(
    () => (index ? querySkills(index.skills, query) : []),
    [index, query],
  )
  const filtered = query.keyword !== '' || query.tag !== null
  const tagLabel = AGENT_CATEGORIES.find((c) => c.tag === query.tag)?.label

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
            >
              Skills
            </h1>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              A skill is a folder of instructions an AI follows for one kind of
              job, with a SKILL.md at the top. Any AI app connected to
              AgentLemon can load one, even apps with no skills feature of their
              own.
            </p>
          </div>
          <Link to="/skills/new" className={primaryButton}>
            Upload a skill
          </Link>
        </div>
      </div>

      <section aria-labelledby="skills-explore" className="mt-8">
        <h2
          id="skills-explore"
          className="mb-4 text-xl font-semibold tracking-tight"
        >
          Explore skills
        </h2>
        <div className="glass rounded-2xl p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search skills</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query.keyword}
                onChange={(e) => patch({ keyword: e.target.value })}
                placeholder="Search skills, tags, authors, files"
                className={cn(fieldClass, 'w-full pl-9')}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="shrink-0">Category</span>
              <select
                value={query.tag ?? ''}
                onChange={(e) => patch({ tag: e.target.value || null })}
                className={cn(
                  fieldClass,
                  'w-full lg:w-40 dark:[&>option]:bg-navy-900',
                )}
              >
                <option value="">All categories</option>
                {AGENT_CATEGORIES.map(({ tag, label }) => (
                  <option key={tag} value={tag}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="radiogroup"
              aria-label="Sort skills"
              className="flex rounded-xl bg-slate-900/5 p-1 dark:bg-white/5"
            >
              {SKILL_SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={query.sort === key}
                  onClick={() => patch({ sort: key })}
                  className={cn(
                    'h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition',
                    query.sort === key
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span aria-live="polite">
              {visible.length} {visible.length === 1 ? 'skill' : 'skills'}
            </span>
            {tagLabel && (
              <button
                type="button"
                onClick={() => patch({ tag: null })}
                className="inline-flex items-center gap-1 rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300"
              >
                {tagLabel}
                <X className="size-3" aria-label="Remove category filter" />
              </button>
            )}
            {filtered && (
              <button
                type="button"
                onClick={reset}
                className="ml-auto text-xs font-medium text-slate-600 underline-offset-4 hover:underline dark:text-slate-300"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-6">
          {!index ? (
            <div
              className={gridClass}
              aria-busy="true"
              aria-label="Loading skills"
            >
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="glass h-56 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : index.state === 'error' ? (
            <div role="alert" className="glass rounded-2xl p-10 text-center">
              <TriangleAlert className="mx-auto size-8 text-amber-500" />
              <p className="mt-3 font-medium">
                The skills list failed to load.
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Check your connection and reload the page.
              </p>
            </div>
          ) : index.skills.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <p className="font-medium">No public skills yet.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Approved public skills appear here within about an hour.
              </p>
              <Link to="/skills/new" className={cn(primaryButton, 'mt-4')}>
                Upload the first one
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <SearchX className="mx-auto size-8 text-slate-400" />
              <p className="mt-3 font-medium">No skills match these filters.</p>
              <button
                type="button"
                onClick={reset}
                className="mt-4 rounded-xl bg-teal-500 px-4 py-2 text-sm font-medium text-accent-ink hover:bg-teal-600"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className={gridClass}>
              {visible.map((skill) => (
                <li key={skill.id}>
                  <SkillCard skill={skill} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  )
}
