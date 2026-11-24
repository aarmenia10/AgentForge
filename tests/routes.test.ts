import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  legacyRedirect,
  matchRoute,
  routeTitle,
  SIGNED_IN_ROUTES,
} from '../src/router/routes'

test('static pages match, with or without one trailing slash', () => {
  for (const [path, name] of [
    ['/', 'home'],
    ['', 'home'],
    ['/index.html', 'home'],
    ['/agents', 'agents'],
    ['/agents/', 'agents'],
    ['/search', 'search'],
    ['/search/', 'search'],
    ['/about', 'about'],
    ['/about/', 'about'],
    ['/me', 'me'],
    ['/me/', 'me'],
    ['/settings', 'settings'],
    ['/settings/', 'settings'],
    ['/friends', 'friends'],
    ['/friends/', 'friends'],
    ['/studio', 'studio'],
    ['/review', 'review'],
    ['/admin/demo-requests', 'demo-requests'],
    ['/review/', 'review'],
    ['/suggestions', 'suggestions'],
    ['/suggestions/', 'suggestions'],
    ['/academy', 'academy'],
    ['/academy/', 'academy'],
  ] as const) {
    assert.deepEqual(matchRoute(path), { name, params: {} }, path)
  }
})

test('Agents and Search have titles, and Settings is open to signed-out visitors', () => {
  assert.equal(routeTitle(matchRoute('/agents')), 'Agents · AgentLemon')
  assert.equal(routeTitle(matchRoute('/search')), 'Search · AgentLemon')
  assert.equal(routeTitle(matchRoute('/settings')), 'Settings · AgentLemon')
  assert.ok(!SIGNED_IN_ROUTES.includes('settings'))
  assert.ok(!SIGNED_IN_ROUTES.includes('agents'))
  assert.ok(!SIGNED_IN_ROUTES.includes('search'))
})

test('the old home-page agent link redirects to /agents and keeps other parameters', () => {
  assert.equal(
    legacyRedirect('/', '?agent=sql-helper'),
    '/agents?agent=sql-helper',
  )
  assert.equal(
    legacyRedirect('/', '?utm=x&agent=sql-helper&tab=install', '#top'),
    '/agents?utm=x&agent=sql-helper&tab=install#top',
  )
  assert.equal(legacyRedirect('/index.html', '?agent=a'), '/agents?agent=a')
  // Nothing to redirect: no agent parameter, or not the home page.
  assert.equal(legacyRedirect('/', ''), null)
  assert.equal(legacyRedirect('/', '?utm=x'), null)
  assert.equal(legacyRedirect('/agents', '?agent=a'), null)
  assert.equal(legacyRedirect('/skills', '?agent=a'), null)
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
  assert.equal(routeTitle(matchRoute('/')), 'AgentLemon · Achieve More.')
  assert.equal(
    routeTitle(matchRoute('/about')),
    'About AgentLemon · AgentLemon',
  )
  assert.equal(routeTitle(matchRoute('/u/ada')), '@ada · AgentLemon')
  assert.match(routeTitle(matchRoute('/x')), /not found/)
  assert.equal(routeTitle(matchRoute('/friends')), 'Friends · AgentLemon')
  assert.equal(
    routeTitle(matchRoute('/academy')),
    'AI made simple · AgentLemon',
  )
  assert.deepEqual([...SIGNED_IN_ROUTES].sort(), [
    'friends',
    'me',
    'review',
    'skill-upload',
    'studio',
    'suggestions',
  ])
})

test('skill pages: the list, the upload page, and one page per valid id', () => {
  assert.deepEqual(matchRoute('/skills'), { name: 'skills', params: {} })
  assert.deepEqual(matchRoute('/skills/'), { name: 'skills', params: {} })
  assert.deepEqual(matchRoute('/skills/new'), {
    name: 'skill-upload',
    params: {},
  })
  assert.deepEqual(matchRoute('/skills/pdf-forms'), {
    name: 'skill',
    params: { id: 'pdf-forms' },
  })
  assert.deepEqual(matchRoute('/skills/pdf-forms/'), {
    name: 'skill',
    params: { id: 'pdf-forms' },
  })
  for (const bad of [
    '/skills/PDF',
    '/skills/a_b',
    '/skills/-a',
    '/skills/a/b',
    '/skills/%E0%A4%A',
    '/skills//',
  ])
    assert.equal(matchRoute(bad).name, 'not-found', bad)
  assert.equal(routeTitle(matchRoute('/skills')), 'Skills · AgentLemon')
  assert.equal(
    routeTitle(matchRoute('/skills/new')),
    'Upload a skill · AgentLemon',
  )
  assert.equal(
    routeTitle(matchRoute('/skills/pdf-forms')),
    'pdf-forms · Skills · AgentLemon',
  )
  assert.equal(routeTitle(matchRoute('/me')), 'My items · AgentLemon')
})
