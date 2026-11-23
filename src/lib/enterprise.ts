import { getFirebaseServices } from '@/lib/firebase'

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

export function personalEmailDomain(domain: string) {
  return personalDomains.has(domain.toLowerCase())
}

export async function enterpriseRequest(
  action: 'register' | 'verify',
  name?: string,
): Promise<{ challenge?: string }> {
  const user = getFirebaseServices().auth.currentUser
  if (!user) throw new Error('Sign in before registering your company.')
  const response = await fetch('/api/enterprise/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (await user.getIdToken(true)),
    },
    body: JSON.stringify({ action, name }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result)
    throw new Error(
      result?.message ?? 'Verification service unavailable. Try again.',
    )
  return result
}
