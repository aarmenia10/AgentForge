import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAgentDialogTabStop } from '../src/components/detail/AgentDetailModal'
import { lockBodyScroll } from '../src/lib/scrollLock'
import { agentCloseUrl } from '../src/pages/AgentsPage'
import { canCloseAgentWithBack } from '../src/router/Router'

test('Close only traverses a history entry created in this document session', () => {
  const entry = { agentLemonAgentSession: 'before-reload' }
  assert.equal(canCloseAgentWithBack(entry, 'before-reload'), true)
  assert.equal(canCloseAgentWithBack(entry, 'after-reload'), false)
  assert.equal(canCloseAgentWithBack({}, 'after-reload'), false)
  assert.equal(canCloseAgentWithBack(null, 'after-reload'), false)
})

test('Close strips the agent even when Back lands on another open agent', () => {
  assert.equal(
    agentCloseUrl(
      'https://agentlemon.web.app/agents?category=coding&agent=first#catalog',
    ),
    'https://agentlemon.web.app/agents?category=coding#catalog',
  )
  assert.equal(
    agentCloseUrl('https://agentlemon.web.app/search?q=coding'),
    null,
  )
})

test('dialog focus wraps past controls hidden in the closed Install dialog', () => {
  const control = (tabIndex: number, length: number) => ({
    tabIndex,
    getClientRects: () => ({ length }) as DOMRectList,
  })
  assert.equal(isAgentDialogTabStop(control(0, 0)), false)
  assert.equal(isAgentDialogTabStop(control(-1, 1)), false)
  assert.equal(isAgentDialogTabStop(control(0, 1)), true)
})

test('Sign in keeps scrolling locked after the underlying agent closes', () => {
  const style = { overflow: '' }
  const closeAgent = lockBodyScroll(style)
  const closeSignIn = lockBodyScroll(style)
  assert.equal(style.overflow, 'hidden')

  closeAgent()
  assert.equal(style.overflow, 'hidden')
  closeAgent()
  assert.equal(style.overflow, 'hidden')
  closeSignIn()
  assert.equal(style.overflow, '')
})

test('closing the newer overlay first restores the original overflow on final release', () => {
  const style = { overflow: 'auto' }
  const closeFirst = lockBodyScroll(style)
  const closeSecond = lockBodyScroll(style)
  closeSecond()
  assert.equal(style.overflow, 'hidden')
  closeFirst()
  assert.equal(style.overflow, 'auto')

  style.overflow = 'scroll'
  lockBodyScroll(style)()
  assert.equal(style.overflow, 'scroll')
})
