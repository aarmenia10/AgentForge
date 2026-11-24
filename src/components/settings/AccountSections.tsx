import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { describeAuthError } from '@/auth/authErrors'
import { ConnectorCard } from '@/components/ConnectorCard'
import { rememberProfile } from '@/components/profile/profileMemory'
import { UsernameForm } from '@/components/profile/UsernameForm'
import { PreferencesSection } from '@/components/settings/PreferencesSection'
import { EmailSettings } from '@/components/settings/EmailSettings'
import { ConnectedApps } from '@/components/settings/ConnectedApps'
import { SettingsSection as Section } from '@/components/settings/SettingsSection'
import { secondaryButton, textLink } from '@/components/studio/parts'
import { describeServiceError } from '@/lib/studioErrors'
import { Link } from '@/router/Router'
import { getProfile } from '@/services/profiles'

type ProfileLoad =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; profile: { handle: string; display_name: string } | null }

/** The signed-in sections of Settings. Loaded only for a signed-in visitor. */
export default function AccountSections() {
  const { user, signOut } = useAuth()
  const [load, setLoad] = useState<ProfileLoad>({ state: 'loading' })
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const uid = user?.uid ?? null

  useEffect(() => {
    if (!uid) return
    let active = true
    getProfile(uid)
      .then((profile) => {
        if (!active) return
        if (profile) rememberProfile(uid, profile.handle)
        setLoad({ state: 'ready', profile })
      })
      .catch(
        (error) =>
          active &&
          setLoad({
            state: 'error',
            message: describeServiceError(error, 'load'),
          }),
      )
    return () => {
      active = false
    }
  }, [uid])

  if (!user) return null

  async function onSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOut()
    } catch (error) {
      setSignOutError(describeAuthError(error, 'sign-out'))
      setSigningOut(false)
    }
  }

  return (
    <>
      <Section id="settings-profile" title="Profile">
        {load.state === 'loading' && (
          <p aria-busy="true">Loading your profile.</p>
        )}
        {load.state === 'error' && <p role="alert">{load.message}</p>}
        {load.state === 'ready' && (
          <>
            {load.profile ? (
              <p className="mb-4">
                People see you as{' '}
                <Link to={`/u/${load.profile.handle}`} className={textLink}>
                  @{load.profile.handle}
                </Link>
                .
              </p>
            ) : (
              <p className="mb-4">
                You have not chosen a username yet. You need one to publish
                agents and to add friends.
              </p>
            )}
            <UsernameForm
              // Remount after the first save so the form switches to editing.
              key={load.profile ? 'edit' : 'create'}
              uid={user.uid}
              profile={load.profile}
              suggestedName={user.displayName}
              avatarUrl={user.avatarUrl}
              onSaved={(profile) => setLoad({ state: 'ready', profile })}
            />
          </>
        )}
      </Section>

      <Section id="settings-preferences" title="Your answers">
        <PreferencesSection />
      </Section>

      <Section id="settings-email" title="Email">
        <EmailSettings />
      </Section>

      <Section id="settings-connector" title="Connector link">
        <ConnectorCard />
      </Section>
      <ConnectedApps />

      <Section id="settings-account" title="Account">
        <button
          type="button"
          onClick={onSignOut}
          aria-disabled={signingOut || undefined}
          className={secondaryButton}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {signingOut ? 'Signing out' : 'Sign out'}
        </button>
        {signOutError && (
          <p role="alert" className="mt-2 text-rose-700 dark:text-rose-300">
            {signOutError}
          </p>
        )}
      </Section>
    </>
  )
}
