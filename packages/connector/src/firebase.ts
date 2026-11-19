import { decode64url } from './tokens'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export const PROJECT = 'agentforge-b10db'
export const TOKEN_ENDPOINT = 'https://securetoken.googleapis.com/v1/token'
export const FIRESTORE_ORIGIN = 'https://firestore.googleapis.com'

interface Value {
  nullValue?: null
  booleanValue?: boolean
  stringValue?: string
  integerValue?: string | number
  doubleValue?: number
  timestampValue?: string
  mapValue?: { fields?: Record<string, Value> }
  arrayValue?: { values?: Value[] }
  referenceValue?: string
}

function encode(value: unknown): Value {
  if (value === null) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number')
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } }
  if (typeof value === 'object' && value)
    return { mapValue: { fields: encodeFields(value) } }
  throw new Error('Invalid Firestore value')
}

function encodeFields(record: object) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, encode(value)]),
  )
}

function decode(value: Value): unknown {
  if ('nullValue' in value) return null
  if ('integerValue' in value) return Number(value.integerValue)
  if (value.timestampValue) return new Date(value.timestampValue)
  if (value.mapValue) return decodeFields(value.mapValue.fields)
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode)
  return (
    value.stringValue ??
    value.booleanValue ??
    value.doubleValue ??
    value.referenceValue
  )
}

function decodeFields(fields: Record<string, Value> = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decode(value)]),
  )
}

interface Document {
  name: string
  fields?: Record<string, Value>
  updateTime: string
}

export class FirestoreError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string,
  ) {
    super('Firebase could not complete the request.')
  }
  get conflict() {
    return (
      ['ALREADY_EXISTS', 'ABORTED', 'FAILED_PRECONDITION'].includes(
        this.code ?? '',
      ) || this.status === 409
    )
  }
}

export function firestore(fetcher: Fetch, idToken: string, project = PROJECT) {
  const root = `projects/${project}/databases/(default)/documents`
  const url = `${FIRESTORE_ORIGIN}/v1/${root}`

  async function call<T>(suffix: string, body?: object): Promise<T> {
    const response = await fetcher(url + suffix, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body && { 'Content-Type': 'application/json' }),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as {
        error?: { status?: string }
      } | null
      throw new FirestoreError(response.status, problem?.error?.status)
    }
    return response.json() as Promise<T>
  }

  return {
    async get(path: string) {
      try {
        const document = await call<Document>(
          `/${path.split('/').map(encodeURIComponent).join('/')}`,
        )
        return {
          fields: decodeFields(document.fields),
          updateTime: document.updateTime,
        }
      } catch (error) {
        if (error instanceof FirestoreError && error.status === 404) return null
        throw error
      }
    },
    async put(path: string, fields: object, updateTime?: string) {
      await call(':commit', {
        writes: [
          {
            update: { name: `${root}/${path}`, fields: encodeFields(fields) },
            currentDocument: updateTime ? { updateTime } : { exists: false },
          },
        ],
      })
    },
    async list(
      collection: 'agents' | 'skills',
      uid: string,
      fields: string[],
      limit: number,
      visibility?: string,
      after?: string,
    ) {
      const match = (fieldPath: string, stringValue: string) => ({
        fieldFilter: {
          field: { fieldPath },
          op: 'EQUAL',
          value: { stringValue },
        },
      })
      const owner = match('owner_uid', uid)
      const rows = await call<{ document?: Document }[]>(':runQuery', {
        structuredQuery: {
          select: { fields: fields.map((fieldPath) => ({ fieldPath })) },
          from: [{ collectionId: collection }],
          where: visibility
            ? {
                compositeFilter: {
                  op: 'AND',
                  filters: [owner, match('visibility', visibility)],
                },
              }
            : owner,
          orderBy: [
            { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
          ],
          ...(after && {
            startAt: {
              values: [{ referenceValue: `${root}/${collection}/${after}` }],
              before: false,
            },
          }),
          limit,
        },
      })
      return rows.flatMap(({ document }) =>
        document ? [decodeFields(document.fields)] : [],
      )
    },
  }
}

export type Firestore = ReturnType<typeof firestore>

export function identity(idToken: string) {
  const payload = idToken.split('.')[1]
  const claims = JSON.parse(new TextDecoder().decode(decode64url(payload))) as {
    exp?: number
    email_verified?: boolean
    sub?: string
  }
  if (!Number.isSafeInteger(claims.exp) || typeof claims.sub !== 'string')
    throw new Error('Invalid Firebase identity')
  return {
    expires: claims.exp!,
    uid: claims.sub,
    verified: claims.email_verified === true,
  }
}

export class FirebaseExchangeError extends Error {
  constructor(readonly code: string) {
    super('Firebase sign-in expired or could not be verified.')
  }
}

export async function exchange(
  fetcher: Fetch,
  key: string,
  refreshToken: string,
) {
  const response = await fetcher(
    `${TOKEN_ENDPOINT}?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    },
  )
  if (!response.ok) {
    // Google's error codes (e.g. INVALID_REFRESH_TOKEN, API_KEY_SERVICE_BLOCKED)
    // carry no secrets; only a strict uppercase code is ever surfaced.
    const reason = await response
      .json()
      .then((value: unknown) => {
        const message = (value as { error?: { message?: unknown } })?.error
          ?.message
        return typeof message === 'string'
          ? /^[A-Z][A-Z_]{2,60}/.exec(message)?.[0]
          : undefined
      })
      .catch(() => undefined)
    throw new FirebaseExchangeError(reason ?? `HTTP_${response.status}`)
  }
  const { id_token, refresh_token, user_id } =
    (await response.json()) as Record<string, string>
  const user = identity(id_token)
  if (
    !refresh_token ||
    user.uid !== user_id ||
    !user.uid ||
    user.uid.includes('/')
  )
    throw new Error('Invalid Firebase token exchange')
  return { idToken: id_token, refreshToken: refresh_token, ...user }
}
