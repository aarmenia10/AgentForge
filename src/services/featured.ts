import {
  doc,
  getDocFromServer,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import {
  currentFeaturedWeek,
  parseFeaturedSelection,
  type FeaturedPick,
} from '../lib/featured'
import { getFirebaseServices } from '../lib/firebase'
import { markExportChange } from './firestore'

export async function getFeaturedSelection() {
  const { db } = getFirebaseServices()
  const snapshot = await getDocFromServer(doc(db, 'featured', 'current'))
  return parseFeaturedSelection(snapshot.data())
}

export async function saveFeaturedSelection(
  uid: string,
  items: FeaturedPick[],
) {
  const { db } = getFirebaseServices()
  const selection = { week_of: currentFeaturedWeek(), items }
  const batch = writeBatch(db)
  batch.set(doc(db, 'featured', 'current'), {
    ...selection,
    updated_by: uid,
    updated_at: serverTimestamp(),
  })
  markExportChange(batch, db, 'featured', 'current')
  await batch.commit()
  return selection
}
