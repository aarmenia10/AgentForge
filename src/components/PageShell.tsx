import type { ReactNode } from 'react'

/**
 * The frame for every page except the home page: a `main` landmark, a
 * centered glass panel, and the page's h1. The router focuses that h1 after a
 * navigation.
 */
export function PageShell({
  title,
  children,
}: {
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <main className="mx-auto w-full flex-1 max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="glass rounded-2xl p-6 sm:p-8">
        <h1
          tabIndex={-1}
          className="break-words text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
        >
          {title}
        </h1>
        {children && (
          <div className="mt-3 text-slate-600 dark:text-slate-300">
            {children}
          </div>
        )}
      </div>
    </main>
  )
}

/** Holds the page area while something resolves, without flashing content. */
export function PageHold() {
  return <main className="flex-1" aria-busy="true" />
}
