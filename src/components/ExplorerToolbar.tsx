import { Search, X } from 'lucide-react'
import { SORT_OPTIONS, type CatalogQuery } from '@/lib/catalog'
import { AGENT_CATEGORIES, AGENT_FRAMEWORKS, FRAMEWORK_LABELS } from '@/types/agent'

interface ExplorerToolbarProps {
  query: CatalogQuery
  onChange: (patch: Partial<CatalogQuery>) => void
  onReset: () => void
  resultCount: number
}

export function ExplorerToolbar({ query, onChange, onReset, resultCount }: ExplorerToolbarProps) {
  const categoryLabel = AGENT_CATEGORIES.find((c) => c.tag === query.category)?.label
  const isFiltered = query.keyword !== '' || query.category !== null || query.framework !== 'all'

  return (
    <div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Filter by keyword</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query.keyword}
            onChange={(event) => onChange({ keyword: event.target.value })}
            placeholder="Filter by keyword, tag, or tool"
            className="field w-full pl-8.5"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          <span className="shrink-0">Framework</span>
          <select
            value={query.framework}
            onChange={(event) =>
              onChange({ framework: event.target.value as CatalogQuery['framework'] })
            }
            className="field w-full lg:w-40"
          >
            <option value="all">All frameworks</option>
            {AGENT_FRAMEWORKS.map((framework) => (
              <option key={framework} value={framework}>
                {FRAMEWORK_LABELS[framework]}
              </option>
            ))}
          </select>
        </label>

        <div role="radiogroup" aria-label="Sort agents" className="segmented h-9 items-center">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={query.sort === key}
              onClick={() => onChange({ sort: key })}
              className="segment"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2 text-xs text-muted">
        <span aria-live="polite">
          {resultCount} {resultCount === 1 ? 'agent' : 'agents'}
        </span>
        {categoryLabel && (
          <button
            type="button"
            onClick={() => onChange({ category: null })}
            className="inline-flex items-center gap-1 rounded text-accent hover:underline"
          >
            in {categoryLabel}
            <X className="size-3" aria-label="Remove category filter" />
          </button>
        )}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto rounded underline underline-offset-2 hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
