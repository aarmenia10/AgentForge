import assert from 'node:assert/strict'
import test from 'node:test'
import {
  myItemsFilterHref,
  readMyItemsFilter,
  type MyItemsFilter,
} from '../src/components/me/myItemsFilter'

test('My items defaults to All and accepts the supported URL filters', () => {
  assert.equal(readMyItemsFilter(''), 'all')
  assert.equal(readMyItemsFilter('?show=skills'), 'skills')
  assert.equal(readMyItemsFilter('?show=agents'), 'agents')
  assert.equal(readMyItemsFilter('?show=councils'), 'councils')
  assert.equal(readMyItemsFilter('?show=unknown'), 'all')
})

test('My items filter links keep All clean and make other filters shareable', () => {
  const filters: MyItemsFilter[] = ['all', 'agents', 'skills', 'councils']
  assert.deepEqual(filters.map(myItemsFilterHref), [
    '/me',
    '/me?show=agents',
    '/me?show=skills',
    '/me?show=councils',
  ])
})
