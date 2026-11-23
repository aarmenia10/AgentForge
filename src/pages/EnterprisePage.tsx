import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Bytes,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  startAfter,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { useAuth } from '@/auth/AuthProvider'
import { PageShell } from '@/components/PageShell'
import { getFirebaseServices } from '@/lib/firebase'

const button =
  'rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
const input =
  'w-full rounded-xl border border-slate-300 bg-transparent p-2 dark:border-white/20'
const panel =
  'space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10'

export default function EnterprisePage() {
  const auth = useAuth()
  const user = auth.user
  const [demo, setDemo] = useState(() =>
    new URLSearchParams(window.location.search).has('demo'),
  )
  return (
    <PageShell title={demo ? 'Enterprise Demo' : 'AgentForce Enterprise'}>
      <button className={`${button} mb-4`} onClick={() => setDemo(!demo)}>
        {demo ? 'Back to AgentForce Enterprise' : 'Enterprise Demo'}
      </button>
      {demo && (
        <p className="mb-4">
          Try a private demo workspace with a verified company email. No DNS
          verification is required. Demo access does not verify company
          ownership.
        </p>
      )}
      <p className="mb-6">
        Your company's private workspace for AI agents and skills. Share
        knowledge securely within your organization, separate from the public
        marketplace.
      </p>
      {auth.status === 'restoring' ? (
        <p>Restoring session…</p>
      ) : !user ? (
        <div className="flex flex-wrap gap-3">
          <button
            className={button}
            onClick={() =>
              auth.openSignIn({
                mode: 'sign-up',
                reason: 'Register using your company email.',
              })
            }
          >
            Register company
          </button>
          <button
            className={button}
            onClick={() =>
              auth.openSignIn({ reason: 'Sign in using your company email.' })
            }
          >
            Employee sign in
          </button>
        </div>
      ) : !user.emailVerified ? (
        <div className="space-y-3">
          <p>Verify your company email before continuing.</p>
          <button
            className={button}
            onClick={() =>
              void auth
                .sendVerificationEmail()
                .catch(() =>
                  alert('Could not send verification email. Try again.'),
                )
            }
          >
            Send verification email
          </button>
          <button
            className={button}
            onClick={() =>
              void auth
                .refreshUser()
                .catch(() =>
                  alert('Could not refresh your account. Try again.'),
                )
            }
          >
            I have verified my email
          </button>
        </div>
      ) : demo ? (
        <DemoWorkspace
          key={user.uid + ':' + user.email}
          uid={user.uid}
          email={user.email}
        />
      ) : (
        <Workspace
          key={user.uid + ':' + user.email}
          uid={user.uid}
          email={user.email}
        />
      )}
    </PageShell>
  )
}

function DemoWorkspace({ uid, email }: { uid: string; email: string }) {
  const [workspace, setWorkspace] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('demo')
    return code && /^[a-zA-Z0-9_-]+$/.test(code) ? code : uid
  })
  const [target, setTarget] = useState(workspace)
  return (
    <div className="space-y-4">
      <p>Signed in as {email}</p>
      <form
        className={panel}
        onSubmit={(event) => {
          event.preventDefault()
          setWorkspace(target.trim())
        }}
      >
        <label className="block">
          Invited to a workspace? Enter its invitation code.
          <input
            className={input}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            pattern="[a-zA-Z0-9_-]+"
          />
        </label>
        <button className={button}>Open workspace</button>
        <button
          type="button"
          className="ml-3 underline"
          onClick={() => {
            setTarget(uid)
            setWorkspace(uid)
          }}
        >
          My demo
        </button>
      </form>
      <DemoAccess
        key={workspace}
        workspace={workspace}
        uid={uid}
        email={email}
      />
    </div>
  )
}

function DemoAccess({
  workspace,
  uid,
  email,
}: {
  workspace: string
  uid: string
  email: string
}) {
  const { db } = getFirebaseServices()
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  const [role, setRole] = useState<string | null>(null)
  const [message, setMessage] = useState('Checking demo access…')

  useEffect(() => {
    let live = true
    const org = doc(db, 'enterprise_demos', workspace)
    if (workspace === uid) {
      async function connect() {
        const current = await getDocFromServer(org)
        if (!current.exists())
          await setDoc(org, { owner: uid, email, domain, name: domain })
        if (live) setRole('admin')
      }
      void connect().catch(() => {
        if (live) setMessage('Demo unavailable. Use a verified company email.')
      })
      return () => {
        live = false
      }
    }
    const stop = onSnapshot(
      doc(org, 'members', uid),
      { includeMetadataChanges: true },
      (snap) => {
        setRole(
          !snap.metadata.fromCache &&
            snap.data()?.active &&
            snap.data()?.email === email
            ? 'member'
            : null,
        )
        setMessage('Request access using your invitation.')
      },
      () => {
        setRole(null)
        setMessage('Demo unavailable. Check your invitation.')
      },
    )
    return stop
  }, [db, workspace, uid, email, domain])

  if (role)
    return (
      <Repository
        key={workspace + ':' + role}
        domain={workspace}
        uid={uid}
        email={email}
        admin={role === 'admin'}
        demo
      />
    )
  return (
    <>
      <p role="status">{message}</p>
      {workspace !== uid && (
        <button
          className={button}
          onClick={() => {
            void setDoc(doc(db, 'enterprise_demos', workspace, 'requests', uid), {
              email,
            })
              .then(() =>
                setMessage(
                  'Request sent. Your administrator must approve access.',
                ),
              )
              .catch(() =>
                setMessage(
                  'Access request not accepted. Check your invitation.',
                ),
              )
          }}
        >
          Request demo access
        </button>
      )}
    </>
  )
}

function Workspace({ uid, email }: { uid: string; email: string }) {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  const { db } = getFirebaseServices()
  const org = doc(db, 'enterprise_orgs', domain)
  const registration = doc(db, 'enterprise_registrations', uid)
  const [membership, setMembership] = useState<DocumentData | null | undefined>(
    undefined,
  )
  const [challenge, setChallenge] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const stop = onSnapshot(
      doc(db, 'enterprise_orgs', domain, 'members', uid),
      { includeMetadataChanges: true },
      (snap) => {
        setMembership(
          snap.metadata.fromCache ? undefined : (snap.data() ?? null),
        )
      },
      () => setMembership(null),
    )
    let live = true
    void getDocFromServer(doc(db, 'enterprise_registrations', uid))
      .then((snap) => {
        if (live && snap.data()?.domain === domain)
          setChallenge(snap.data()?.challenge ?? '')
      })
      .catch(() => {})
    return () => {
      live = false
      stop()
    }
  }, [db, domain, uid])

  async function act(work: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch {
      setMessage(
        'Request could not be completed. Check your permissions and try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (membership === undefined) return <p>Checking company access…</p>
  if (membership?.active)
    return (
      <Repository
        key={domain + ':' + uid + ':' + membership.role}
        domain={domain}
        uid={uid}
        email={email}
        admin={membership.role === 'admin'}
      />
    )
  return (
    <div className="space-y-4">
      <p>Signed in as {email}</p>
      {membership ? (
        <p>Company access is disabled. Contact your company administrator.</p>
      ) : (
        <>
          <section className={panel}>
            <h2 className="font-semibold">Join your company</h2>
            <p>
              Request access to an existing verified organization. Its
              administrator must approve you.
            </p>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await setDoc(doc(org, 'requests', uid), { email })
                  setMessage(
                    'Access requested. Ask your company administrator to approve it.',
                  )
                })
              }
            >
              Request access to {domain}
            </button>
          </section>
          <form
            className={panel}
            onSubmit={(event) => {
              event.preventDefault()
              void act(async () => {
                const token = crypto.randomUUID()
                await setDoc(registration, {
                  domain,
                  name: name.trim(),
                  challenge: token,
                })
                setChallenge(token)
              })
            }}
          >
            <h2 className="font-semibold">Register a company</h2>
            <p>
              Company domains must be verified by proving control of their DNS
              records.
            </p>
            <label className="block">
              Company name
              <input
                className={input}
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className={button} disabled={busy}>
              Generate verification challenge
            </button>
            {challenge && (
              <div className="break-all text-sm">
                <p>
                  Add the following DNS TXT record, then contact AgentForce
                  Enterprise support for verification:
                </p>
                <p>Host: _agentforce-enterprise.{domain}</p>
                <p>Value: agentforce-enterprise={challenge}</p>
                <p>Registration reference: {uid}</p>
              </div>
            )}
          </form>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  )
}

function Repository({
  domain,
  uid,
  email,
  admin,
  demo = false,
}: {
  domain: string
  uid: string
  email: string
  admin: boolean
  demo?: boolean
}) {
  const { db } = getFirebaseServices()
  const org = doc(db, demo ? 'enterprise_demos' : 'enterprise_orgs', domain)
  const [items, setItems] = useState<Array<DocumentData & { id: string }>>([])
  const [requests, setRequests] = useState<
    Array<DocumentData & { id: string }>
  >([])
  const [members, setMembers] = useState<Array<DocumentData & { id: string }>>(
    [],
  )
  const [company, setCompany] = useState(domain)
  const [inviteEmail, setInviteEmail] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [kind, setKind] = useState('agent')
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const org = doc(db, demo ? 'enterprise_demos' : 'enterprise_orgs', domain)
    const read = async (sub: string) => {
      const result: Array<DocumentData & { id: string }> = []
      let cursor: QueryDocumentSnapshot | undefined
      do {
        const page = await getDocsFromServer(
          query(
            collection(org, sub),
            limit(50),
            ...(cursor ? [startAfter(cursor)] : []),
          ),
        )
        result.push(
          ...page.docs.map((snap) => ({ ...snap.data(), id: snap.id })),
        )
        cursor = page.docs.length === 50 ? page.docs.at(-1) : undefined
      } while (cursor)
      return result
    }
    setCompany((await getDocFromServer(org)).data()?.name ?? domain)
    setItems(await read('items'))
    if (admin) {
      setRequests(await read('requests'))
      setMembers(await read('members'))
    }
  }, [db, domain, admin, demo])
  useEffect(() => {
    void refresh().catch(() => setMessage('Unable to load your repository.'))
  }, [refresh])
  async function act(work: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await work()
      await refresh()
    } catch {
      setMessage(
        'Action could not be completed. Please check access and try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  function reset() {
    setEditing(null)
    setName('')
    setDescription('')
    setCategory('')
    setKind('agent')
    setFile(null)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    void act(async () => {
      if (
        (!editing && !file) ||
        (file && (file.size === 0 || file.size > 262144))
      )
        throw new Error('Invalid file size')
      const fields = { name: name.trim(), description, category, kind }
      const attachment = file
        ? {
            filename: file.name,
            file: Bytes.fromUint8Array(
              new Uint8Array(await file.arrayBuffer()),
            ),
          }
        : {}
      if (editing)
        await updateDoc(doc(org, 'items', editing), {
          ...fields,
          ...attachment,
        })
      else
        await setDoc(doc(collection(org, 'items')), {
          ...fields,
          ...attachment,
          owner: uid,
          creator: email,
          createdAt: serverTimestamp(),
        })
      reset()
      form.reset()
    })
  }
  return (
    <div className="space-y-6">
      <p className="font-semibold text-teal-600 dark:text-teal-300">
        {company} · {demo ? 'Enterprise Demo' : 'Private repository'} ·{' '}
        {admin ? 'Administrator' : 'Member'}
      </p>
      <form className={panel} onSubmit={submit}>
        <h2 className="font-semibold">
          {editing ? 'Edit item' : 'Upload an agent or skill'}
        </h2>
        <label className="block">
          Name
          <input
            className={input}
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          Description
          <textarea
            className={input}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block">
          Category
          <input
            className={input}
            maxLength={80}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label className="block">
          Type
          <select
            className={input}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="agent">Agent</option>
            <option value="skill">Skill</option>
          </select>
        </label>
        <label className="block">
          Package (maximum 256 KiB)
          <input
            key={editing ?? 'new'}
            type="file"
            required={!editing}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className={button} disabled={busy}>
          {editing ? 'Save changes' : 'Upload privately'}
        </button>
        {editing && (
          <button type="button" className="ml-3 underline" onClick={reset}>
            Cancel
          </button>
        )}
      </form>
      <section className="space-y-3">
        <h2 className="font-semibold">Company library</h2>
        <input
          type="search"
          className={input}
          aria-label="Search company library"
          placeholder="Search agents and skills"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="text-sm underline"
          disabled={busy}
          onClick={() => void act(async () => {})}
        >
          Refresh library
        </button>
        {items.length === 0 && <p>No private items yet.</p>}
        {items
          .filter((item) =>
            [
              item.name,
              item.description,
              item.category,
              item.kind,
              item.creator,
            ]
              .join(' ')
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((item) => (
            <article className={panel} key={item.id}>
              <h3 className="font-semibold">{item.name}</h3>
              <p className="text-xs">
                {item.kind} · {item.category} · {item.creator} ·{' '}
                {item.createdAt?.toDate().toLocaleDateString()}
              </p>
              <p className="break-words">{item.description}</p>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const current = (
                      await getDocFromServer(doc(org, 'items', item.id))
                    ).data()
                    if (!current) throw new Error('Not found')
                    const bytes = Uint8Array.from(
                      (current.file as Bytes).toUint8Array(),
                    )
                    const url = URL.createObjectURL(
                      new Blob([bytes], { type: 'application/octet-stream' }),
                    )
                    const link = document.createElement('a')
                    link.href = url
                    link.download = current.filename
                    link.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  })
                }
              >
                Download
              </button>
              {(admin || item.owner === uid) && (
                <>
                  <button
                    className="ml-3 underline"
                    onClick={() => {
                      setEditing(item.id)
                      setName(item.name)
                      setDescription(item.description)
                      setCategory(item.category)
                      setKind(item.kind)
                      setFile(null)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="ml-3 underline"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Delete this private item?'))
                        void act(() => deleteDoc(doc(org, 'items', item.id)))
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
            </article>
          ))}
      </section>
      {admin && (
        <section className={panel}>
          <h2 className="font-semibold">Employee access</h2>
          {demo && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void act(async () => {
                  const address = inviteEmail.trim().toLowerCase()
                  await setDoc(doc(org, 'invites', address), { email: address })
                  setInviteEmail('')
                  setMessage(
                    'Invitation saved. Share the code below with your coworker.',
                  )
                })
              }}
            >
              <label className="block">
                Coworker company email
                <input
                  type="email"
                  className={input}
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </label>
              <button className={button} disabled={busy}>
                Invite coworker
              </button>
              <p className="break-all text-sm">Invitation code: {domain}</p>
              <p>
                Share this code privately. Invited coworkers must verify their
                email and request access for your approval.
              </p>
            </form>
          )}
          {requests.map((request) => (
            <div className="flex flex-wrap gap-2" key={request.id}>
              <span>{request.email}</span>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const batch = writeBatch(db)
                    batch.set(doc(org, 'members', request.id), {
                      email: request.email,
                      active: true,
                      role: 'member',
                    })
                    batch.delete(doc(org, 'requests', request.id))
                    await batch.commit()
                  })
                }
              >
                Approve
              </button>
              <button
                className="underline"
                disabled={busy}
                onClick={() =>
                  void act(() => deleteDoc(doc(org, 'requests', request.id)))
                }
              >
                Decline
              </button>
            </div>
          ))}
          {members.map((member) => (
            <div className="flex flex-wrap gap-2" key={member.id}>
              <span>
                {member.email} · {member.role} ·{' '}
                {member.active ? 'Active' : 'Disabled'}
              </span>
              {member.id !== uid && (
                <>
                  <button
                    className="underline"
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        updateDoc(doc(org, 'members', member.id), {
                          active: !member.active,
                        }),
                      )
                    }
                  >
                    {member.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="underline"
                    disabled={busy || demo}
                    onClick={() =>
                      void act(() =>
                        updateDoc(doc(org, 'members', member.id), {
                          role: member.role === 'admin' ? 'member' : 'admin',
                        }),
                      )
                    }
                  >
                    {member.role === 'admin' ? 'Make member' : 'Make admin'}
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      <p role="status">{message}</p>
    </div>
  )
}
