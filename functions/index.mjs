import { randomUUID } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'

initializeApp()
const db = getFirestore()
const auth = getAuth()
const resolver = new Resolver({ timeout: 3000, tries: 2 })
const personalDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'rocketmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.de',
  'mail.com',
  'yandex.com',
  'zoho.com',
])
const lifetime = 7 * 24 * 60 * 60 * 1000

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function identity(uid) {
  const user = await auth.getUser(uid)
  const domain = user.email?.split('@')[1]?.toLowerCase()
  if (
    user.disabled ||
    !user.emailVerified ||
    !domain ||
    !/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      domain,
    )
  )
    throw new RequestError(403, 'Verify your corporate email first.')
  if (personalDomains.has(domain))
    throw new RequestError(
      403,
      'Personal email accounts can use demo mode only.',
    )
  return { domain, email: user.email }
}

export const enterpriseVerify = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, maxInstances: 10 },
  async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      if (req.method !== 'POST') throw new RequestError(405, 'Use POST.')
      const token = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '')?.[1]
      if (!token) throw new RequestError(401, 'Sign in first.')
      const claims = await auth.verifyIdToken(token, true).catch(() => {
        throw new RequestError(401, 'Sign in again to continue.')
      })
      const uid = claims.uid
      const { domain, email } = await identity(uid)
      const registration = db.collection('enterprise_registrations').doc(uid)
      const org = db.collection('enterprise_orgs').doc(domain)
      if (req.body?.action === 'register') {
        const name = req.body.name
        if (typeof name !== 'string' || !name.trim() || name.length > 100)
          throw new RequestError(
            400,
            'Enter a company name of 1–100 characters.',
          )
        const challenge = await db.runTransaction(async (tx) => {
          const [company, previous] = await Promise.all([
            tx.get(org),
            tx.get(registration),
          ])
          if (company.exists)
            throw new RequestError(
              409,
              'Company already registered. Request employee access instead.',
            )
          const prior = previous.data()
          if (
            prior?.domain === domain &&
            prior.email === email &&
            Number.isFinite(prior.issuedAt) &&
            Date.now() - prior.issuedAt < lifetime
          )
            return prior.challenge
          const challenge = randomUUID()
          tx.set(registration, {
            domain,
            email,
            name: name.trim(),
            challenge,
            issuedAt: Date.now(),
          })
          return challenge
        })
        res.json({ challenge })
        return
      }
      if (req.body?.action !== 'verify')
        throw new RequestError(400, 'Unknown verification action.')
      const pending = await db.runTransaction(async (tx) => {
        const [company, snapshot] = await Promise.all([
          tx.get(org),
          tx.get(registration),
        ])
        if (company.exists)
          throw new RequestError(
            409,
            'Company already registered. Request employee access instead.',
          )
        const data = snapshot.data()
        if (
          !data ||
          data.domain !== domain ||
          data.email !== email ||
          !Number.isFinite(data.issuedAt) ||
          Date.now() - data.issuedAt >= lifetime
        )
          throw new RequestError(400, 'Generate a new DNS challenge first.')
        if (Date.now() - (data.lastAttempt ?? 0) < 10000)
          throw new RequestError(429, 'Wait ten seconds before trying again.')
        tx.update(registration, { lastAttempt: Date.now() })
        return data
      })
      const records = await resolver
        .resolveTxt('_agentforce-enterprise.' + domain)
        .catch(() => [])
      if (
        !records.some(
          (record) =>
            record.join('') === 'agentforce-enterprise=' + pending.challenge,
        )
      )
        throw new RequestError(
          400,
          'DNS record not found yet. Check the TXT record and try again after propagation.',
        )
      const current = await identity(uid)
      if (current.email !== email || current.domain !== domain)
        throw new RequestError(
          403,
          'Your verified email changed. Sign in again.',
        )
      await db.runTransaction(async (tx) => {
        const [company, latest] = await Promise.all([
          tx.get(org),
          tx.get(registration),
        ])
        if (company.exists)
          throw new RequestError(
            409,
            'Company already registered. Request employee access instead.',
          )
        if (
          latest.get('challenge') !== pending.challenge ||
          latest.get('issuedAt') !== pending.issuedAt ||
          latest.get('email') !== email ||
          latest.get('domain') !== domain ||
          Date.now() - pending.issuedAt >= lifetime
        )
          throw new RequestError(
            409,
            'Registration changed. Generate a new challenge.',
          )
        tx.create(org, { domain, name: pending.name, verifiedAt: new Date() })
        tx.create(org.collection('members').doc(uid), {
          email,
          role: 'admin',
          active: true,
        })
        tx.delete(registration)
      })
      res.json({ verified: true })
    } catch (error) {
      if (error instanceof RequestError) {
        res.status(error.status).json({ message: error.message })
      } else {
        res.status(500).json({
          message: 'Verification could not be completed. Try again.',
        })
      }
    }
  },
)
