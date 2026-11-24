import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COPY_CONFIRMATION_MS, copyText } from '../src/lib/clipboard'

test('copy waits for clipboard success before confirming', async () => {
  let finish!: () => void
  let copied = false
  const result = copyText('exact instructions', (text) => {
    assert.equal(text, 'exact instructions')
    return new Promise<void>((resolve) => {
      finish = resolve
    })
  }).then((status) => {
    copied = status === 'copied'
  })
  assert.equal(copied, false)
  finish()
  await result
  assert.equal(copied, true)
  assert.equal(COPY_CONFIRMATION_MS, 3000)
})

test('failed clipboard writes report an error rather than success', async () => {
  assert.equal(
    await copyText('instructions', async () => {
      throw new Error('Clipboard blocked')
    }),
    'error',
  )
  assert.equal(
    await copyText('instructions', () => {
      throw new Error('Clipboard unavailable')
    }),
    'error',
  )
})
