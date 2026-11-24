import { lazy, Suspense } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { AppearanceControls } from '@/components/appearance/AppearanceControls'
import { PageShell } from '@/components/PageShell'
import { SettingsSection as Section } from '@/components/settings/SettingsSection'
import { primaryButtonClass } from '@/components/ui'

// Its own chunk: a visitor who is not signed in never downloads the profile,
// email, connector, and account code.
const AccountSections = lazy(
  () => import('@/components/settings/AccountSections'),
)

/**
 * Appearance is open to everyone, signed in or not, and comes first. Only the
 * account sections below it ask for sign-in. Unlike the signed-in pages this
 * page does not open the sign-in dialog on arrival, because a visitor who only
 * wants to change the look has no reason to sign in.
 */
export default function SettingsPage() {
  const { status, user, openSignIn } = useAuth()
  const signedIn = status === 'signed-in' && user !== null

  return (
    <PageShell title="Settings">
      <div className="mt-6 space-y-10 text-sm">
        <Section id="settings-appearance" title="Appearance">
          <p className="mb-4">
            Pick a mode, a background, and an accent color. Your choice is saved
            in this browser only.
          </p>
          <div className="max-w-md">
            <AppearanceControls />
          </div>
        </Section>

        {status === 'restoring' ? (
          <p aria-busy="true">Loading your account.</p>
        ) : signedIn ? (
          <Suspense fallback={<p aria-busy="true">Loading your settings.</p>}>
            <AccountSections />
          </Suspense>
        ) : (
          <Section id="settings-signin" title="Your account">
            <p>
              Sign in to change your display name, username, and account
              details.
            </p>
            <button
              type="button"
              onClick={() =>
                openSignIn({ reason: 'Sign in to open your settings.' })
              }
              className={`${primaryButtonClass} mt-4`}
            >
              Sign in
            </button>
          </Section>
        )}
      </div>
    </PageShell>
  )
}
