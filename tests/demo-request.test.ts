import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emailPayload,
  sendEmail,
  validateRequest,
} from '../functions/demo-request.js'

import { isDemoFounder, normalizeDemoRequest } from '../src/lib/demoRequest'

const sample = {
  requestId: '01234567-0123-0123-0123-012345678901',
  website: '',
  name: 'Jane Doe',
  position: 'CEO',
  company: 'Acme',
  email: 'jane@acme.example',
  size: '',
  description: 'Private collaboration',
}

test('normalizes an enquiry and removes extra fields', () => {
  const data = validateRequest({ ...sample, name: ' Jane ', extra: 'ignored' })
  assert.equal(data.name, 'Jane')
  assert.equal(data.extra, undefined)
  assert.equal(data.requestId, undefined)
})

test('rejects invalid, oversized and honeypot submissions', () => {
  for (const change of [
    { website: 'spam' },
    { company: 'Acme\nExtra' },
    { email: 'invalid' },
    { description: 'x'.repeat(3001) },
    { name: '  ' },
  ]) {
    assert.throws(() => validateRequest({ ...sample, ...change }))
  }
})

test('email uses configured recipients and inquiry fields', async () => {
  const data = {
    ...validateRequest(sample),
    submittedAt: '2026-11-23T12:00:00.000Z',
  }
  const config = {
    key: 'test',
    from: 'demo@example.com',
    recipients: ['one@example.com', 'two@example.com'],
  }
  const payload = emailPayload(data, config.from, config.recipients)
  assert.deepEqual(payload.to, config.recipients)
  assert.equal(payload.reply_to, sample.email)
  assert.equal(payload.subject, 'New AgentForce Enterprise Demo Request — Acme')
  assert.ok(payload.text.includes(data.submittedAt))
  assert.ok(payload.text.includes(sample.description))
  await sendEmail(data, config, 'test-id', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.equal(options.headers['Idempotency-Key'], 'enterprise-demo/test-id')
    assert.deepEqual(JSON.parse(options.body), payload)
    return { ok: true }
  })
  await assert.rejects(
    sendEmail(data, config, 'test-id', async () => ({ ok: false })),
  )
})


test('public form normalizes fields and enforces the honeypot', () => {
  assert.equal(normalizeDemoRequest({ ...sample, name: ' Jane ' }).name, 'Jane')
  assert.throws(() => normalizeDemoRequest({ ...sample, website: 'spam' }))
  assert.throws(() => normalizeDemoRequest({ ...sample, email: 'invalid' }))
})

test('only verified founder email addresses qualify', () => {
  const user = {
    uid: 'founder',
    displayName: 'Founder',
    avatarUrl: null,
    emailVerified: true,
    email: 'tcerto1234@gmail.com',
  }
  assert.equal(isDemoFounder(user), true)
  assert.equal(
    isDemoFounder({ ...user, email: 'aidanarmenia10@gmail.com' }),
    true,
  )
  assert.equal(isDemoFounder({ ...user, emailVerified: false }), false)
  assert.equal(isDemoFounder({ ...user, email: 'admin@example.com' }), false)
  assert.equal(isDemoFounder(null), false)
})
