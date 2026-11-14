import { useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { useRoute } from '@/router/Router'
import { PageHold, PageShell } from './PageShell'

interface RequireAccountProps {
  /** The page's name, used as the heading while signed out. */
  title: string
  /** One line saying what the page is for, shown while signed out. */
  purpose: string
  /** The line at the top of the sign-in dialog. */
  reason: string
  children: ReactNode
}

/**
 * The gate for signed-in pages. While a remembered session restores it holds
 * the layout quietly. Signed out, it explains the page, offers "Sign in", and
 * opens the dialog once on arrival; after sign-in the page renders in place.
 * Signing out while here returns to the home page.
 */
export default function RequireAccount({
  title,
  purpose,
  reason,
  children,
}: RequireAccountProps) {
  const { status, user, openSignIn } = useAuth()
  const { go } = useRoute()
  const asked = useRef(false)
  const wasSignedIn = useRef(false)
  const signedIn = status === 'signed-in' && user !== null

  useEffect(() => {
    if (signedIn) {
      wasSignedIn.current = true
      return
    }
    if (status !== 'signed-out') return
    if (wasSignedIn.current) {
      go('/', { replace: true })
      return
    }
    if (!asked.current) {
      asked.current = true
      openSignIn({ reason })
    }
  }, [signedIn, status, go, openSignIn, reason])

  if (status === 'restoring') return <PageHold />
  if (signedIn) return <>{children}</>

  return (
    <PageShell title={title}>
      <p>{purpose}</p>
      <button
        type="button"
        onClick={() => openSignIn({ reason })}
        className="mt-5 inline-flex h-10 items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition hover:bg-teal-800 dark:bg-teal-400 dark:text-navy-950 dark:hover:bg-teal-300"
      >
        Sign in
      </button>
    </PageShell>
  )
}
