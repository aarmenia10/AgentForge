import { useEffect, useRef, useState } from 'react'
import SignInDialog from '@/components/auth/SignInDialog'
import { PageShell } from '@/components/PageShell'
import { primaryButton, secondaryButton } from '@/components/studio/parts'
import { READ, WRITE } from '@/services/connectorConfig'
import {
  connectorConsent,
  finishConnectorConsent,
  freshConnectorSession,
  type ConsentDetails,
} from '@/services/connectorConsent'

export default function ConnectPage() {
  const r = useRef<string | null>(null)
  const [session] = useState(freshConnectorSession)
  const [details, setDetails] = useState<ConsentDetails | null>(null)
  const [save, setSave] = useState(true)
  const [signIn, setSignIn] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const signInAttempt = useRef(0)

  useEffect(() => {
    if (r.current === null) {
      r.current =
        new URLSearchParams(window.location.hash.slice(1)).get('r') ?? ''
      if (window.location.hash)
        history.replaceState(
          history.state,
          '',
          window.location.pathname + window.location.search,
        )
    }
    let mounted = true
    const load = r.current
      ? connectorConsent<ConsentDetails>('describe', { r: r.current })
      : Promise.reject(
          new Error(
            'Open this page from your AI app to connect to AgentLemon.',
          ),
        )
    load
      .then((value) => {
        if (mounted) setDetails(value)
      })
      .catch((error: unknown) => {
        if (mounted)
          setError(
            error instanceof Error
              ? error.message
              : 'Could not load the connection request.',
          )
      })
    return () => {
      mounted = false
      signInAttempt.current++
      void session.close()
    }
  }, [session])

  async function returnToApp(step: 'complete' | 'deny') {
    if (pending) return
    setPending(true)
    setError('')
    try {
      const refresh_token = session.refreshToken()
      if (step === 'complete' && !refresh_token)
        throw new Error('Sign in again before allowing access.')
      const scopes =
        save && details?.scopes.includes(WRITE) ? [READ, WRITE] : [READ]
      const { finish } = await connectorConsent<{ finish: string }>(step, {
        r: r.current,
        ...(step === 'complete' && { refresh_token, scopes }),
      })
      await session.close()
      setEmail(null)
      finishConnectorConsent(finish)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not return to your AI app.',
      )
      setPending(false)
    }
  }

  async function signedIn(sign: () => Promise<{ email: string | null }>) {
    const attempt = ++signInAttempt.current
    const user = await sign()
    if (signInAttempt.current === attempt)
      setEmail(user.email ?? 'Your AgentLemon account')
  }

  return (
    <PageShell title="Connect to AgentLemon">
      {error && (
        <p role="alert" className="mb-4 text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
      {!details && !error && <p role="status">Loading connection request…</p>}
      {details && (
        <div className="space-y-4">
          <p>
            <strong>{details.host}</strong> is requesting access to your
            AgentLemon account.
          </p>
          {details.name && (
            <p className="text-sm">Name provided by the app: {details.name}</p>
          )}
          {details.loopback && (
            <p className="text-amber-700 dark:text-amber-300">
              This sends access to an app on this computer. Continue only if you
              started the connection there.
            </p>
          )}
          <p>Read your items and items shared with you that you can access.</p>
          {details.scopes.includes(WRITE) && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={save}
                disabled={pending}
                onChange={(event) => setSave(event.target.checked)}
              />{' '}
              Allow the app to save private items to your account.
            </label>
          )}
          {email && (
            <p>
              Signed in as <strong>{email}</strong>.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {email ? (
              <button
                type="button"
                className={primaryButton}
                disabled={pending}
                onClick={() => void returnToApp('complete')}
              >
                Allow
              </button>
            ) : (
              <button
                type="button"
                className={primaryButton}
                disabled={pending}
                onClick={() => setSignIn(true)}
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              className={secondaryButton}
              disabled={pending}
              onClick={() => void returnToApp('deny')}
            >
              Cancel
            </button>
            {pending && (
              <span role="status" className="self-center">
                Returning to your app…
              </span>
            )}
          </div>
        </div>
      )}
      {signIn && (
        <SignInDialog
          isolated={{
            prepare: session.prepare,
            closeSignIn: () => setSignIn(false),
            dismiss: () => {
              signInAttempt.current++
              setSignIn(false)
              void session.close()
            },
            signInWithEmail: (email, password) =>
              signedIn(() => session.signInWithEmail(email, password)),
            signInWithGoogle: () => signedIn(session.signInWithGoogle),
          }}
        />
      )}
    </PageShell>
  )
}
