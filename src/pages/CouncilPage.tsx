import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { CouncilEditor } from '@/components/councils/CouncilEditor'
import {
  CouncilRoster,
  type MemberStatus,
} from '@/components/councils/CouncilRoster'
import { PageHold, PageShell } from '@/components/PageShell'
import {
  primaryButton,
  secondaryButton,
  smallButton,
  textLink,
  VisibilityLabel,
} from '@/components/studio/parts'
import { formatCouncilRef } from '@/lib/councilSchema'
import { publicOriginLabel } from '@/lib/portability'
import { Link, useRoute } from '@/router/Router'
import { publicCouncils } from '@/services/councilPublic'
import type { CouncilManifest, CouncilRecord } from '@/types/council'

type View = {
  council: CouncilManifest
  details: (MemberStatus | null)[]
  accountUid?: string
  owned?: CouncilRecord
  edit?: CouncilRecord | null
  public: boolean
}
const store = () =>
  import('@/services/councilStore').then(({ councilStore }) => councilStore())
const copyId = (id: string) =>
  id.slice(0, 1400).replace(/-+$/, '') +
  '-copy-' +
  crypto.randomUUID().slice(0, 8)

export default function CouncilPage() {
  const { route, location } = useRoute()
  const params = new URLSearchParams(location.search)
  const id = route.params.id
  const version = params.get('version')
  const account = params.has('mine') || params.has('shared')
  const { user, status, openSignIn } = useAuth()
  const uid = user?.uid
  const [view, setView] = useState<View | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    async function load(): Promise<View> {
      if (!account && version && !/^[0-9A-Za-z.+-]+$/.test(version))
        throw new Error('Invalid version.')
      if (!account) {
        const { council, items } = await publicCouncils.get(
          id,
          version ?? undefined,
        )
        return {
          council,
          public: true,
          details: items.map(({ item }) => ({
            name: item.name,
            handle: item.author.handle,
          })),
        }
      }
      if (!uid) throw new Error('Sign in to view this council.')
      const accountStore = await store()
      const council = await accountStore.get(id)
      if (!council) throw new Error('Council unavailable.')
      const owned = council.owner_uid === uid ? council : undefined
      const [details, edit] = await Promise.all([
        Promise.all(
          council.members.map(({ ref }) => accountStore.memberStatus(ref)),
        ),
        owned ? accountStore.getEdit(id) : null,
      ])
      return { council, details, owned, edit, public: false, accountUid: uid }
    }
    if (account && status === 'restoring') return
    load()
      .then((next) => {
        if (active) {
          setView(next)
          setFailed(false)
        }
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [id, version, account, uid, status, revision])

  async function act(action: () => Promise<string>, refresh = false) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setNotice(await action())
      if (refresh) setRevision((current) => current + 1)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not update the council.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (account && status === 'restoring') return <PageHold />
  if (account && !uid)
    return (
      <PageShell title="Council">
        <button
          className={primaryButton}
          onClick={() =>
            openSignIn({ reason: 'Sign in to view this council.' })
          }
        >
          Sign in
        </button>
      </PageShell>
    )
  if (failed)
    return (
      <PageShell title="Council unavailable">
        <p>The council or a required version could not be loaded.</p>
        <Link className={textLink} to="/councils">
          All councils
        </Link>
      </PageShell>
    )
  if (!view || (account && view.accountUid !== uid)) return <PageHold />
  const { council, owned, edit, details } = view
  const ref = formatCouncilRef(council.id, council.version)
  const origin = publicOriginLabel(council.origin_app)
  const prompt = view.public
    ? 'Load ' +
      ref +
      ' with AgentLemon get_council. Use its pinned members and coordination instructions for my task.'
    : 'On the AgentLemon account connector, call get_item with kind council, id ' +
      council.id +
      ' and version ' +
      council.version +
      '. Load each exact member pin and use the coordination instructions for my task.'

  function saveCopy() {
    if (!uid) {
      openSignIn({ reason: 'Sign in to save a private copy of the council.' })
      return
    }
    if (!user?.emailVerified) {
      setNotice('')
      setError(
        'Confirm your email address before saving a council. Settings can send the link again.',
      )
      return
    }
    void act(async () => {
      await (
        await store()
      ).create({ ...council, id: copyId(council.id), visibility: 'private' })
      return 'Private copy saved to My items.'
    })
  }
  return (
    <PageShell title={council.name}>
      <div className="space-y-5">
        <p>{council.description}</p>
        <p className="break-all text-xs">
          @{council.author.handle}
          {council.author.verified ? ' · Verified author' : ''} ·{' '}
          <code>{ref}</code>
          {origin && ' · ' + origin}
        </p>
        {(view.public || uid) && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await navigator.clipboard.writeText(prompt)
                  return 'Prompt copied. Paste it into an AI app connected to AgentLemon.'
                })
              }
            >
              Use the whole council
            </button>
            {view.public && (
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={saveCopy}
              >
                Save council
              </button>
            )}
          </div>
        )}
        {owned && (
          <div className="glass space-y-3 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <VisibilityLabel visibility={owned.visibility} />
              {owned.visibility === 'public' && (
                <span>{owned.review_status}</span>
              )}
              <label className="flex items-center gap-2">
                Change visibility
                <select
                  className={smallButton}
                  value={owned.visibility}
                  disabled={busy}
                  onChange={(event) => {
                    const visibility = event.target
                      .value as CouncilRecord['visibility']
                    void act(async () => {
                      await (await store()).setVisibility(id, visibility)
                      return visibility === 'public'
                        ? 'Submitted for public review.'
                        : 'Visibility updated.'
                    }, true)
                  }}
                >
                  <option value="private">Private</option>
                  <option value="friends">Friends</option>
                  <option value="public">Public</option>
                </select>
              </label>
              {owned.visibility === 'public' &&
                owned.review_status === 'rejected' && (
                  <button
                    className={smallButton}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await (await store()).setVisibility(id, 'public')
                        return 'Resubmitted for review.'
                      }, true)
                    }
                  >
                    Resubmit
                  </button>
                )}
              <button
                className={smallButton}
                type="button"
                onClick={() => setEditing((current) => !current)}
              >
                {editing ? 'Close editor' : 'Edit council'}
              </button>
            </div>
            {edit && (
              <p>
                Proposed version {edit.version} · {edit.review_status}{' '}
                <button
                  className={smallButton}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await (await store()).withdraw(id)
                      setEditing(false)
                      return 'Proposal withdrawn.'
                    }, true)
                  }
                >
                  Withdraw
                </button>
              </p>
            )}
            {editing && (
              <CouncilEditor
                key={(edit ?? owned).stats.updated_at}
                record={edit ?? owned}
                done={(message) => {
                  setEditing(false)
                  setNotice(message)
                  setRevision((current) => current + 1)
                }}
              />
            )}
          </div>
        )}
        {notice && (
          <p role="status">
            {notice}{' '}
            {notice.includes('My items') && (
              <Link className={textLink} to="/me">
                Open My items
              </Link>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <section className="space-y-3" aria-label="Members">
          <h2 className="text-lg font-semibold">Members</h2>
          <CouncilRoster members={council.members} details={details} />
        </section>
        <section className="space-y-3" aria-label="Coordination instructions">
          <h2 className="text-lg font-semibold">Coordination instructions</h2>
          <pre className="glass whitespace-pre-wrap break-words rounded-2xl p-4 text-sm">
            {council.instructions}
          </pre>
        </section>
        <Link className={textLink} to="/councils">
          All councils
        </Link>
      </div>
    </PageShell>
  )
}
