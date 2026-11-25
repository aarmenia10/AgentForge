import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  displayAuthorHandle,
  displayAuthorName,
} from '../src/lib/authorBranding'

test('legacy registry author uses current display branding', () => {
  assert.equal(displayAuthorHandle('agentforge'), 'agentlemon')
  assert.equal(
    displayAuthorName({ uid: 'agentforge', name: 'AgentForge' }),
    'AgentLemon',
  )
})

test('other authors retain their identity', () => {
  assert.equal(displayAuthorHandle('alice'), 'alice')
  assert.equal(displayAuthorName({ uid: 'alice', name: 'Alice' }), 'Alice')
})
