import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchRoute, routeTitle, SIGNED_IN_ROUTES } from '../src/router/routes'

test('static pages match, with or without one trailing slash', () => {
  for (const [path, name] of [
    ['/', 'home'],
    ['', 'home'],
    ['/index.html', 'home'],
    ['/me', 'me'],
    ['/me/', 'me'],
    ['/settings', 'settings'],
    ['/settings/', 'settings'],
    ['/friends', 'friends'],
    ['/friends/', 'friends'],
    ['/studio', 'studio'],
    ['/review', 'review'],
    ['/review/', 'review'],
  ] as const) {
    assert.deepEqual(matchRoute(path), { name, params: {} }, path)
  }
})

test('profiles match valid handles only', () => {
  assert.deepEqual(matchRoute('/u/ada-lovelace'), {
    name: 'profile',
    params: { handle: 'ada-lovelace' },
  })
  assert.deepEqual(matchRoute('/u/abc/'), {
    name: 'profile',
    params: { handle: 'abc' },
  })
  for (const bad of [
    '/u/',
    '/u',
    '/u/ab', // too short
    '/u/Ada', // uppercase
    '/u/-abc', // leading hyphen
    '/u/abc-', // trailing hyphen
    '/u/a%20bc', // whitespace
    '/u/%E0%A4%A', // malformed escape
    `/u/${'a'.repeat(31)}`, // too long
    '/u/abc/agents',
  ]) {
    assert.equal(matchRoute(bad).name, 'not-found', bad)
  }
})

test('unknown paths are not found', () => {
  for (const path of [
    '/nope',
    '/me/extra',
    '/ME',
    '//',
    '/settings//',
    '/friends/x',
  ]) {
    assert.deepEqual(matchRoute(path), { name: 'not-found', params: {} }, path)
  }
})

test('every route has a title and the gated set is exact', () => {
  assert.equal(
    routeTitle(matchRoute('/')),
    'AgentLemon · The GitHub for AI Agents',
  )
  assert.equal(routeTitle(matchRoute('/u/ada')), '@ada · AgentLemon')
  assert.match(routeTitle(matchRoute('/x')), /not found/)
  assert.equal(routeTitle(matchRoute('/friends')), 'Friends · AgentLemon')
  assert.deepEqual([...SIGNED_IN_ROUTES].sort(), [
    'friends',
    'me',
    'review',
    'settings',
    'studio',
  ])
})
