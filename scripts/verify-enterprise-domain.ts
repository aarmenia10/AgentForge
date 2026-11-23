import { resolveTxt } from 'node:dns/promises'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Run only from an authorized operator environment with application default credentials.
const [projectId, uid] = process.argv.slice(2)
if (!projectId || !uid || uid.includes('/'))
  throw new Error(
    'Usage: tsx scripts/verify-enterprise-domain.ts PROJECT_ID REGISTRATION_UID',
  )
const app = initializeApp({ credential: applicationDefault(), projectId })
const db = getFirestore(app)
const registration = db.doc('enterprise_registrations/' + uid)
const pending = (await registration.get()).data()
if (!pending) throw new Error('Registration not found')
const { domain, name, challenge } = pending
if (
  typeof domain !== 'string' ||
  !/^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$/.test(domain) ||
  typeof name !== 'string' ||
  !name.trim() ||
  name.length > 100 ||
  typeof challenge !== 'string' ||
  !/^[a-f0-9-]{36}$/.test(challenge)
)
  throw new Error('Invalid registration')
const user = await getAuth(app).getUser(uid)
if (
  user.disabled ||
  !user.emailVerified ||
  user.email?.split('@')[1]?.toLowerCase() !== domain
)
  throw new Error('Verified company email required')
const records = await resolveTxt('_agentforce-enterprise.' + domain)
if (
  !records.some(
    (record) => record.join('') === 'agentforce-enterprise=' + challenge,
  )
)
  throw new Error('DNS challenge not found')
const org = db.doc('enterprise_orgs/' + domain)
await db.runTransaction(async (tx) => {
  const [existing, latest] = await Promise.all([
    tx.get(org),
    tx.get(registration),
  ])
  if (existing.exists) throw new Error('Organization already registered')
  if (
    latest.get('challenge') !== challenge ||
    latest.get('domain') !== domain ||
    latest.get('name') !== name
  )
    throw new Error('Registration changed; start again')
  tx.create(org, { name, domain, verifiedAt: new Date() })
  tx.create(org.collection('members').doc(uid), {
    role: 'admin',
    active: true,
    email: user.email,
  })
  tx.delete(registration)
})
console.log('Enterprise domain verified and initial administrator activated.')
