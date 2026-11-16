import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SEED_AGENTS } from '../src/data/seedAgents'

const ROOT = resolve(import.meta.dirname, '..')

// The router and auth provider read `window` and `localStorage` while
// rendering. A minimal stand-in is enough for a server render; no effect runs.
Object.assign(globalThis, {
  window: {
    location: { pathname: '/', search: '', href: 'http://localhost/' },
    addEventListener() {},
    removeEventListener() {},
  },
})

async function renderWithProviders(node: () => ReactNode) {
  const { RouterProvider } = await import('../src/router/Router')
  const { AuthProvider } = await import('../src/auth/AuthProvider')
  return renderToStaticMarkup(
    createElement(
      RouterProvider,
      null,
      createElement(AuthProvider, null, node()),
    ),
  )
}

test('the detail view has a star button with the count, a help line, and an author link', async () => {
  const { AgentDetailModal } =
    await import('../src/components/detail/AgentDetailModal')
  const agent = SEED_AGENTS[0]
  const markup = await renderWithProviders(() =>
    createElement(AgentDetailModal, { agent, onClose: () => {} }),
  )
  const button =
    /<button[^>]*aria-label="Star this agent, [^"]+ stars"[^>]*>/.exec(markup)
  assert.ok(button, 'star button present')
  // README 7.1: an icon and a number, never a pill.
  assert.doesNotMatch(button[0], /rounded-full|bg-amber/)
  // Signed out: no pressed state, because nothing is known yet.
  assert.doesNotMatch(button[0], /aria-pressed/)
  assert.match(markup, /refresh about hourly/)
  assert.match(markup, new RegExp(`href="/u/${agent.author.handle}"`))
})

test('cards show the star count only and link the author to their profile', async () => {
  const { AgentCard } = await import('../src/components/AgentCard')
  const agent = SEED_AGENTS[0]
  const markup = await renderWithProviders(() =>
    createElement(AgentCard, { agent, onOpen: () => {} }),
  )
  assert.match(markup, / stars<\/span>/)
  assert.doesNotMatch(markup, /Star this agent/)
  assert.match(markup, new RegExp(`href="/u/${agent.author.handle}"`))
})

test('the star state is read only through a dynamic import', () => {
  const source = readFileSync(
    resolve(ROOT, 'src/components/detail/AgentDetailModal.tsx'),
    'utf8',
  )
  assert.doesNotMatch(source, /^\s*import[^(]*['"]firebase/m)
  assert.match(source, /import\('firebase\/firestore'\)/)
  assert.match(source, /openSignIn\(\{ reason: /)
  assert.match(source, /agentRepository\.toggleStar\(/)
})
