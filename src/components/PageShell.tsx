import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { closeDetail, useRoute } from '@/router/Router'
import type { RouteName } from '@/router/routes'

const closeFallbacks: Partial<Record<RouteName, string>> = {
  studio: '/agents',
  'skill-upload': '/skills',
  settings: '/',
  connect: '/',
  profile: '/',
  'council-member': '/councils',
  'demo-requests': '/enterprise',
  review: '/me',
  suggestions: '/',
  about: '/',
  'not-found': '/',
}

/**
 * The frame for every page except the home page: a `main` landmark, a
 * centered glass panel, and the page's h1. The router focuses that h1 after a
 * navigation.
 */
export function PageShell({
  title,
  children,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  onClose?: () => void
}) {
  const { route, go } = useRoute()
  const fallback = closeFallbacks[route.name]
  const close =
    onClose ?? (fallback ? () => closeDetail(go, fallback) : undefined)
  return (
    <main className="mx-auto w-full flex-1 max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="glass rounded-2xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h1
            tabIndex={-1}
            className="min-w-0 break-words text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
          >
            {title}
          </h1>
          {close && (
            <button
              type="button"
              onClick={close}
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-medium text-fg hover:bg-surface"
            >
              <X className="size-5" aria-hidden="true" />
              Close
            </button>
          )}
        </div>
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
