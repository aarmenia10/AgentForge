import type { AuthUser } from './auth'

export const DEMO_STATUSES = [
  'New',
  'Contacted',
  'Demo Scheduled',
  'Completed',
  'Archived',
] as const

export type DemoStatus = (typeof DEMO_STATUSES)[number]

export function isDemoFounder(user: AuthUser | null): boolean {
  return (
    user?.emailVerified === true &&
    ['tcerto1234@gmail.com', 'aidanarmenia10@gmail.com'].includes(user.email)
  )
}

export function normalizeDemoRequest(data: Record<string, unknown>) {
  if (data.website !== '') throw new Error('Invalid request')
  const fields = {
    name: 100,
    position: 100,
    company: 150,
    email: 254,
    size: 80,
    description: 3000,
  }
  const result: Record<string, string> = {}
  for (const [key, max] of Object.entries(fields)) {
    const value = data[key]
    if (typeof value !== 'string' || value.length > max)
      throw new Error('Invalid request')
    const trimmed = value.trim()
    if (
      (key !== 'size' && !trimmed) ||
      (key !== 'description' && /[\r\n]/.test(trimmed))
    )
      throw new Error('Invalid request')
    result[key] = trimmed
  }
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(result.email))
    throw new Error('Invalid email')
  result.email = result.email.toLowerCase()
  return result
}
