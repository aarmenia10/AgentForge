import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuthorTag } from '../src/components/ui'

test('author tag displays the AgentForge handle and preserves the Verified author badge', () => {
  const author = {
    uid: 'person',
    name: 'Display name',
    handle: 'agent-author',
    verified: true,
  }
  const markup = renderToStaticMarkup(
    createElement(AuthorTag, { author, showVerifiedLabel: true }),
  )
  assert.match(markup, /@agent-author/)
  assert.match(markup, />Verified author</)
  assert.match(
    markup,
    /Verified author: the registry confirmed who this author is/,
  )
  assert.doesNotMatch(markup, /<a[ >]|github/i)
  const unverified = renderToStaticMarkup(
    createElement(AuthorTag, { author: { ...author, verified: false } }),
  )
  assert.match(unverified, /@agent-author/)
  assert.doesNotMatch(unverified, /<svg|Verified author|<a[ >]/)
})
