import { Search, X } from 'lucide-react'
import { SORT_OPTIONS, type CatalogQuery } from '@/lib/catalog'
import { AGENT_CATEGORIES, AGENT_FRAMEWORKS, FRAMEWORK_LABELS } from '@/types/agent'
import { cn } from './ui'

interface ExplorerToolbarProps {
  query: CatalogQuery
  onChange: (patch: Partial<CatalogQuery>) => void
  onReset: () => void
  resultCount: number
}

const fieldClass =
  'h-10 rounded-xl border border-slate-200 bg-white/70 px-3 text-sm focus:border-teal-500 focus:outline-none dark:border-white/10 dark:bg-white/5'

export function ExplorerToolbar({ query, onChange, onReset, resultCount }: ExplorerToolbarProps) {
  const categoryLabel = AGENT_CATEGORIES.find((c) => c.tag === query.category)?.label
  const isFiltered = query.keyword !== '' || query.category !== null || query.framework !== 'all'

  return (
    <div className="glass rounded-2xl p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Filter by keyword</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query.keyword}
            onChange={(event) => onChange({ keyword: event.target.value })}
            placeholder="Filter by keyword, tag, or tool"
            className={cn(fieldClass, 'w-full pl-9')}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="shrink-0">Framework</span>
          <select
            value={query.framework}
            onChange={(event) =>
              onChange({ framework: event.target.value as CatalogQuery['framework'] })
            }
            className={cn(fieldClass, 'w-full lg:w-40 dark:[&>option]:bg-navy-900')}
          >
            <option value="all">All frameworks</option>
            {AGENT_FRAMEWORKS.map((framework) => (
              <option key={framework} value={framework}>
                {FRAMEWORK_LABELS[framework]}
              </option>
            ))}
          </select>
        </label>

        <div
          role="radiogroup"
          aria-label="Sort agents"
          className="flex rounded-xl bg-slate-900/5 p-1 dark:bg-white/5"
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={query.sort === key}
              onClick={() => onChange({ sort: key })}
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
          {resultCount} {resultCount === 1 ? 'agent' : 'agents'}
        </span>
        {categoryLabel && (
          <button
            type="button"
            onClick={() => onChange({ category: null })}
            className="inline-flex items-center gap-1 rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300"
          >
            {categoryLabel}
            <X className="size-3" aria-label="Remove category filter" />
          </button>
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs font-medium text-slate-600 underline-offset-4 hover:underline dark:text-slate-300"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
