import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { getFirebaseServices } from '@/lib/firebase'
import { normalizeDemoRequest, type DemoStatus } from '@/lib/demoRequest'

const collections = ['enterprise_demo_inbox', 'enterprise_demo_requests']

export interface DemoRequest {
  path: string
  name: string
  position: string
  company: string
  email: string
  size: string
  description: string
  submittedAt: string
  status: DemoStatus
  notes: string
}

export async function submitDemoRequest(data: Record<string, unknown>) {
  const fields = normalizeDemoRequest(data)
  const bytes = new TextEncoder().encode(JSON.stringify(fields))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const id = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const { db } = getFirebaseServices()
  await setDoc(doc(db, collections[0], id), {
    ...fields,
    website: '',
    submittedAt: serverTimestamp(),
    status: 'New',
  })
}

export function watchDemoRequests(
  receive: (requests: DemoRequest[]) => void,
  fail: () => void,
) {
  const { db } = getFirebaseServices()
  const results = new Map<string, DemoRequest[]>()
  const stops = collections.map((name) =>
    onSnapshot(
      collection(db, name),
      (snapshot) => {
        results.set(
          name,
          snapshot.docs.map((entry) => {
            const data = entry.data()
            return {
              path: entry.ref.path,
              name: data.name ?? '',
              position: data.position ?? '',
              company: data.company ?? '',
              email: data.email ?? '',
              size: data.size ?? '',
              description: data.description ?? '',
              submittedAt:
                typeof data.submittedAt === 'string'
                  ? data.submittedAt
                  : (data.submittedAt?.toDate().toISOString() ?? ''),
              status: data.status ?? 'New',
              notes: data.notes ?? '',
            }
          }),
        )
        if (results.size === collections.length)
          receive(Array.from(results.values()).flat())
      },
      fail,
    ),
  )
  return () => stops.forEach((stop) => stop())
}

export async function updateDemoRequest(
  path: string,
  change: { status?: DemoStatus; notes?: string },
) {
  await updateDoc(doc(getFirebaseServices().db, path), change)
}

export async function deleteDemoRequest(path: string) {
  await deleteDoc(doc(getFirebaseServices().db, path))
}

export async function appendDemoNote(path: string, note: string) {
  const { db } = getFirebaseServices()
  const ref = doc(db, path)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Request no longer exists')
    const notes = [snapshot.data().notes, note.trim()]
      .filter(Boolean)
      .join('\n')
    transaction.update(ref, { notes })
  })
}
