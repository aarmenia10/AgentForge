export const DAY = 86400
export const IDLE = 30 * DAY
export const ABSOLUTE = 90 * DAY

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decode64url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding')
  const bytes = Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (char) => char.charCodeAt(0),
  )
  if (base64url(bytes) !== value) throw new Error('Non-canonical encoding')
  return bytes
}

type Type = 'client' | 'req' | 'handoff' | 'code' | 'at' | 'rt'
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
const keyId = /^[A-Za-z0-9_-]{1,64}$/

export interface KeyRing {
  current: string
  keys: Record<string, string>
  previous?: { kid: string; expires: number }
}

export function tokenCodec(
  ring: KeyRing,
  now: () => number,
  random: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
) {
  if (
    !ring ||
    !keyId.test(ring.current) ||
    !Object.hasOwn(ring.keys, ring.current)
  )
    throw new Error('Invalid encryption key configuration')
  const material = new Map(
    Object.entries(ring.keys).map(([id, value]) => {
      const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
      if (!keyId.test(id) || bytes.length !== 32)
        throw new Error('Invalid encryption key')
      return [id, bytes] as const
    }),
  )

  // Import and derive within the request. Worker Web Crypto promises must
  // not be shared across concurrent requests in the same isolate.
  async function derive(id: string, typ: Type) {
    const bytes = material.get(id)
    if (!bytes || (ring.previous?.kid === id && now() >= ring.previous.expires))
      throw new Error('Unknown encryption key')
    const master = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, [
      'deriveKey',
    ])
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(),
        info: encoder.encode(`agentlemon-connector/v1/${typ}`),
      },
      master,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }

  return {
    randomId: (length: number) => base64url(random(length)),
    async seal(typ: Type, data: object, exp: number | null) {
      const id = ring.current
      const iv = new Uint8Array(random(12))
      const key = await derive(id, typ)
      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: encoder.encode(`al1.${id}.${typ}`),
          },
          key,
          encoder.encode(
            JSON.stringify({ ...data, typ, iat: now(), exp, v: 1 }),
          ),
        ),
      )
      const payload = new Uint8Array(iv.length + ciphertext.length)
      payload.set(iv)
      payload.set(ciphertext, iv.length)
      return `al1.${id}.${base64url(payload)}`
    },
    async open<T>(typ: Type, value: string | null): Promise<T | null> {
      try {
        if (!value || value.length > 16000) return null
        const [prefix, id, payload, extra] = value.split('.')
        if (prefix !== 'al1' || extra !== undefined || !payload) return null
        const bytes = decode64url(payload)
        if (bytes.length < 29) return null
        const key = await derive(id, typ)
        const plaintext = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: bytes.subarray(0, 12),
            additionalData: encoder.encode(`al1.${id}.${typ}`),
          },
          key,
          bytes.subarray(12),
        )
        const data = JSON.parse(decoder.decode(plaintext))
        if (
          data.typ !== typ ||
          data.v !== 1 ||
          !Number.isSafeInteger(data.iat) ||
          data.iat > now()
        )
          return null
        if (
          typ === 'client'
            ? data.exp !== null
            : !(Number.isSafeInteger(data.exp) && data.exp > now())
        )
          return null
        return data as T
      } catch {
        return null
      }
    },
  }
}

export async function pkceChallenge(verifier: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(verifier)),
    ),
  )
}
