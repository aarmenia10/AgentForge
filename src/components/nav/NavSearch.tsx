import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRoute } from '@/router/Router'

/**
 * The site-wide search field. Enter opens `/search?q=...`, which reads the
 * public catalog files only. From md up it is a wide field in the top bar;
 * on a phone it is an icon that expands to cover the bar.
 */
export function NavSearch() {
  const { route, location, go } = useRoute()
  const onSearchPage = route.name === 'search'
  const urlQuery = onSearchPage
    ? (new URLSearchParams(location.search).get('q') ?? '')
    : ''
  const [value, setValue] = useState(urlQuery)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<HTMLButtonElement>(null)

  // Keep the field in step with the address bar: back and forward, a link to
  // another query, and leaving the search page (which clears it).
  useEffect(() => {
    setValue(urlQuery)
  }, [urlQuery, onSearchPage])

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  function collapse(restoreFocus: boolean) {
    setExpanded(false)
    if (restoreFocus) iconRef.current?.focus()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const q = value.trim()
    if (!q) {
      inputRef.current?.focus()
      return
    }
    go(`/search?q=${encodeURIComponent(q)}`)
    // The router moves focus to the results heading.
    setExpanded(false)
  }

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        aria-label="Search AgentLemon"
        aria-expanded={expanded}
        onClick={() => setExpanded(true)}
        className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-fg transition hover:bg-surface-2 md:hidden"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>

      <form
        role="search"
        onSubmit={onSubmit}
        className={
          expanded
            ? 'absolute inset-0 z-10 flex items-center gap-2 bg-page px-4 sm:px-6 md:static md:z-auto md:min-w-0 md:flex-1 md:bg-transparent md:p-0'
            : 'hidden md:block md:min-w-0 md:flex-1'
        }
      >
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search AgentLemon</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
          />
          <input
            ref={inputRef}
            type="search"
            name="q"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && expanded) {
                event.stopPropagation()
                collapse(true)
              }
            }}
            placeholder="Search AgentLemon"
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full rounded-full border border-transparent bg-surface pl-10 pr-4 text-sm text-fg placeholder:text-fg-muted focus:border-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]"
          />
        </label>
        {expanded && (
          <button
            type="button"
            aria-label="Close search"
            onClick={() => collapse(true)}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-fg transition hover:bg-surface-2 md:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </form>
    </>
  )
}
