import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { secondaryButton } from '@/components/studio/parts'
import { ACCOUNT_RESOURCE } from '@/services/connectorConfig'
import { connectorGrantStore } from '@/services/connectorGrants'

type Store = Awaited<ReturnType<typeof connectorGrantStore>>
type Apps = Awaited<ReturnType<Store['list']>>

export function ConnectedApps() {
  const { user } = useAuth()
  return user ? <AppsPanel key={user.uid} uid={user.uid} /> : null
}

function AppsPanel({ uid }: { uid: string }) {
  const [apps, setApps] = useState<Apps | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action: 'load' | 'disconnect', id?: string) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const store = await connectorGrantStore(uid)
      if (action === 'load') setApps(await store.list())
      else {
        await store.disconnect(id)
        setApps((items) =>
          id ? (items?.filter((app) => app.id !== id) ?? []) : [],
        )
      }
    } catch {
      setError(
        action === 'load'
          ? 'Could not load your connected apps. Try again.'
          : 'Could not disconnect the app. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="settings-connected-apps">
      <h2
        id="settings-connected-apps"
        className="mb-3 text-lg font-semibold text-slate-900 dark:text-white"
      >
        Connected apps
      </h2>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) void run('load')
        }}
      >
        <summary className="w-fit cursor-pointer">
          Manage AI app connections
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            Add this connector address in your AI app to access your items and
            save from chat.
          </p>
          <input
            aria-label="Account connector URL"
            value={ACCOUNT_RESOURCE}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-slate-500/30 bg-transparent p-2 font-mono text-xs"
          />
          {busy && apps === null && (
            <p role="status">Loading connected apps…</p>
          )}
          {error && <p role="alert">{error}</p>}
          {error && apps === null && (
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => void run('load')}
            >
              Try again
            </button>
          )}
          {apps?.length === 0 && <p>No connected apps.</p>}
          {!!apps?.length && (
            <>
              <ul className="divide-y divide-slate-500/20">
                {apps.map((app) => (
                  <li
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <p className="font-semibold">{app.app}</p>
                      <p>
                        Last refreshed{' '}
                        <time dateTime={new Date(app.refreshed).toISOString()}>
                          {new Date(app.refreshed).toLocaleString()}
                        </time>
                      </p>
                    </div>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => void run('disconnect', app.id)}
                      aria-label={`Disconnect ${app.app}`}
                    >
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => void run('disconnect')}
              >
                Disconnect all apps
              </button>
            </>
          )}
        </div>
      </details>
    </section>
  )
}
