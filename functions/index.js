import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { hash, sendEmail, validateRequest } from './demo-request.js'

initializeApp()
const db = getFirestore()
const emailConfig = defineSecret('DEMO_EMAIL_CONFIG')

export const requestDemo = onCall(
  { maxInstances: 5, timeoutSeconds: 30 },
  async (request) => {
    let data
    try {
      data = validateRequest(request.data)
    } catch {
      throw new HttpsError('invalid-argument', 'Invalid demo request.')
    }
    const now = Date.now()
    const hour = Math.floor(now / 3600000)
    const id = hash(JSON.stringify(data))
    const ref = db.collection('enterprise_demo_requests').doc(id)
    const limits = [
      ['global', 100],
      ['ip-' + hash(request.rawRequest.ip || 'unknown'), 5],
      ['email-' + hash(data.email.toLowerCase()), 3],
    ]
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return
      const counters = limits.map(([key]) =>
        db.collection('enterprise_demo_rate_limits').doc(key + '-' + hour),
      )
      const snapshots = await transaction.getAll(...counters)
      for (let index = 0; index < limits.length; index++) {
        if ((snapshots[index].data()?.count || 0) >= limits[index][1]) {
          throw new HttpsError('resource-exhausted', 'Please try again later.')
        }
      }
      for (let index = 0; index < counters.length; index++) {
        transaction.set(counters[index], {
          count: (snapshots[index].data()?.count || 0) + 1,
          expiresAt: Timestamp.fromMillis((hour + 2) * 3600000),
        })
      }
      transaction.create(ref, {
        ...data,
        submittedAt: new Date(now).toISOString(),
        deliveryStatus: 'pending',
      })
    })
    return { accepted: true }
  },
)

export const notifyDemoRequest = onDocumentCreated(
  {
    document: 'enterprise_demo_requests/{id}',
    secrets: [emailConfig],
    retry: true,
    maxInstances: 3,
  },
  async (event) => {
    if (!event.data) return
    const ref = event.data.ref
    const snapshot = await ref.get()
    const data = snapshot.data()
    if (!data || data.deliveryStatus === 'sent') return
    try {
      const config = JSON.parse(emailConfig.value())
      if (
        !config.key ||
        !config.from ||
        !Array.isArray(config.recipients) ||
        config.recipients.length !== 2
      ) {
        throw new Error('Missing delivery configuration')
      }
      await sendEmail(data, config, ref.id)
      await ref.update({ deliveryStatus: 'sent' })
    } catch {
      await ref.update({ deliveryStatus: 'failed' })
      throw new Error('Demo request notification failed')
    }
  },
)
