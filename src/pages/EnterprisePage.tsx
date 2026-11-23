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
import { personalEmailDomain, enterpriseRequest } from '@/lib/enterprise'

const button =
  'rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'
const input =
  'w-full rounded-xl border border-slate-300 bg-transparent p-2 dark:border-white/20'
const panel =
  'space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10'

export default function EnterprisePage() {
  const auth = useAuth()
  const user = auth.user
  return (
    <PageShell title="AgentForce Enterprise">
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
                reason:
                  'Register using your company email, or use a personal email for a demo.',
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
          <p>Verify your email before continuing.</p>
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

function Workspace({ uid, email }: { uid: string; email: string }) {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  const { db } = getFirebaseServices()
  const org = doc(db, 'enterprise_orgs', domain)
  const [membership, setMembership] = useState<DocumentData | null | undefined>(
    undefined,
  )
  const [challenge, setChallenge] = useState('')
  const [existing, setExisting] = useState<boolean | undefined>(undefined)
  const [requested, setRequested] = useState(false)
  const [demo, setDemo] = useState(personalEmailDomain(domain))
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (personalEmailDomain(domain)) return
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
    void getDocFromServer(doc(db, 'enterprise_orgs', domain))
      .then((snap) => {
        if (live) setExisting(snap.exists())
      })
      .catch(() => {
        if (live)
          setMessage(
            'Unable to check company registration. Refresh and try again.',
          )
      })
    const stopRequests = onSnapshot(
      doc(db, 'enterprise_orgs', domain, 'requests', uid),
      (snap) => setRequested(snap.exists()),
      () => {},
    )
    void getDocFromServer(doc(db, 'enterprise_registrations', uid))
      .then((snap) => {
        if (live && snap.data()?.domain === domain && snap.data()?.issuedAt)
          setChallenge(snap.data()?.challenge ?? '')
      })
      .catch(() => {})
    return () => {
      live = false
      stop()
      stopRequests()
    }
  }, [db, domain, uid])

  async function act(work: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Request could not be completed. Try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (demo)
    return (
      <div className="space-y-4">
        <p className="font-semibold">
          Demo workspace · Only you can access it.
        </p>
        <p>
          Use sample files only. This workspace is separate from every company.
        </p>
        {!personalEmailDomain(domain) && (
          <button className={button} onClick={() => setDemo(false)}>
            Back to company workspace
          </button>
        )}
        <Repository
          domain={domain}
          uid={uid}
          email={email}
          admin={false}
          demo
        />
      </div>
    )
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
      <p>
        Signed in as {email} · Company domain: {domain}
      </p>
      <button className={button} onClick={() => setDemo(true)}>
        Try Enterprise demo
      </button>
      {existing === undefined && <p>Checking company registration…</p>}
      {membership ? (
        <p>Company access is disabled. Contact your company administrator.</p>
      ) : (
        <>
          {existing === true && (
            <section className={panel}>
              <h2 className="font-semibold">Join your company</h2>
              <p>
                Request access to an existing verified organization. Its
                administrator must approve you.
              </p>
              <button
                className={button}
                disabled={busy || requested}
                onClick={() =>
                  void act(async () => {
                    await setDoc(doc(org, 'requests', uid), { email })
                    setRequested(true)
                    setMessage(
                      'Access requested. Ask your company administrator to approve it.',
                    )
                  })
                }
              >
                {requested ? 'Approval pending' : `Request access to ${domain}`}
              </button>
            </section>
          )}
          {existing === false && (
            <form
              className={panel}
              onSubmit={(event) => {
                event.preventDefault()
                void act(async () => {
                  const result = await enterpriseRequest(
                    'register',
                    name.trim(),
                  )
                  setChallenge(result.challenge ?? '')
                  setMessage('DNS challenge issued. Add the TXT record below.')
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
                    Add this DNS TXT record with your domain provider. DNS
                    changes may take time to propagate.
                  </p>
                  <p>Host: _agentforce-enterprise.{domain}</p>
                  <p>Value: agentforce-enterprise={challenge}</p>
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await enterpriseRequest('verify')
                        setMessage(
                          'Company verified. Your workspace is being activated.',
                        )
                      })
                    }
                  >
                    Verify Company
                  </button>
                </div>
              )}
            </form>
          )}
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
  const org = doc(
    db,
    demo ? 'enterprise_demos' : 'enterprise_orgs',
    demo ? uid : domain,
  )
  const [items, setItems] = useState<Array<DocumentData & { id: string }>>([])
  const [requests, setRequests] = useState<
    Array<DocumentData & { id: string }>
  >([])
  const [members, setMembers] = useState<Array<DocumentData & { id: string }>>(
    [],
  )
  const [company, setCompany] = useState(domain)
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
    const org = doc(
      db,
      demo ? 'enterprise_demos' : 'enterprise_orgs',
      demo ? uid : domain,
    )
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
    setCompany(
      demo
        ? 'Enterprise demo'
        : ((await getDocFromServer(org)).data()?.name ?? domain),
    )
    setItems(await read('items'))
    if (admin) {
      setRequests(await read('requests'))
      setMembers(await read('members'))
    }
  }, [db, domain, admin, demo, uid])
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
        {company} · {demo ? 'Demo repository' : 'Private repository'} ·{' '}
        {admin ? 'Administrator' : demo ? 'Owner' : 'Member'}
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
        <h2 className="font-semibold">
          {demo ? 'Demo library' : 'Company library'}
        </h2>
        <input
          type="search"
          className={input}
          aria-label="Search workspace library"
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
                    disabled={busy}
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
