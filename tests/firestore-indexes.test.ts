import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

interface IndexFile {
  indexes: { collectionGroup: string; fields: unknown[] }[]
  fieldOverrides: { collectionGroup: string; fieldPath: string }[]
}

// Firebase refuses to deploy a composite index with a single field ("this
// index is not necessary"). One-field indexes go in fieldOverrides instead.
test('composite indexes have at least two fields', async () => {
  const file = JSON.parse(
    await readFile('firestore.indexes.json', 'utf8'),
  ) as IndexFile
  for (const index of file.indexes)
    assert.ok(
      index.fields.length >= 2,
      `${index.collectionGroup} composite index has one field; use fieldOverrides`,
    )
})

// CI deploys indexes after the export build, and a new composite index takes
// minutes to build. The exporter must therefore never need one: the first
// deploy that added a filtered comments query failed on a missing index.
test('the ratings export reads comments without a composite index', async () => {
  const source = await readFile('scripts/ratingsExport.ts', 'utf8')
  const query = source.slice(source.indexOf(".collection('comments')"))
  const chain = query.slice(0, query.indexOf('.get()'))
  assert.doesNotMatch(chain, /\.where\(/)
})
