import { doc } from 'firebase/firestore'
import type { DocumentReference, Firestore } from 'firebase/firestore'

export function markExportChange(
  write: { set(ref: DocumentReference, value: { revision: string }): unknown },
  db: Firestore,
  source:
    | 'agents'
    | 'agent_versions'
    | 'skills'
    | 'skill_versions'
    | 'votes'
    | 'comments'
    | 'featured',
  id: string,
) {
  write.set(doc(db, 'export_sources', source, 'changes', id), {
    revision: crypto.randomUUID(),
  })
}
