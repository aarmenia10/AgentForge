import { createHash } from 'node:crypto'

export function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function validateRequest(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    data.website !== '' ||
    typeof data.requestId !== 'string' ||
    !/^[a-f0-9-]{36}$/i.test(data.requestId)
  ) {
    throw new Error('Invalid request')
  }
  const result = {}
  for (const [key, max] of Object.entries({
    name: 100,
    position: 100,
    company: 150,
    email: 254,
    size: 80,
    description: 3000,
  })) {
    const value = data[key]
    if (typeof value !== 'string' || value.length > max) {
      throw new Error('Invalid field')
    }
    const trimmed = value.trim()
    if (
      (key !== 'size' && !trimmed) ||
      (key !== 'description' && /[\r\n]/.test(trimmed))
    ) {
      throw new Error('Invalid field')
    }
    result[key] = trimmed
  }
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(result.email)) {
    throw new Error('Invalid email')
  }
  return result
}

export function emailPayload(data, from, recipients) {
  return {
    from,
    to: recipients,
    reply_to: data.email,
    subject: 'New AgentLemon Enterprise Demo Request — ' + data.company,
    text: [
      'Full name: ' + data.name,
      'Job title / position: ' + data.position,
      'Company name: ' + data.company,
      'Business email: ' + data.email,
      'Company size: ' + (data.size || 'Not supplied'),
      'Submitted (UTC): ' + data.submittedAt,
      '',
      'Description of business needs:',
      data.description,
    ].join('\n'),
  }
}

export async function sendEmail(data, config, id, fetcher = fetch) {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.key,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'enterprise-demo/' + id,
    },
    body: JSON.stringify(emailPayload(data, config.from, config.recipients)),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Email delivery failed')
}
