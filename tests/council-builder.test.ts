import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addMember,
  cleanOrder,
  describeSaveError,
  filterCandidates,
  hasErrors,
  moveMember,
  parseTags,
  pinCandidate,
  removeMember,
  setMemberOrder,
  setMemberRole,
  sortMembers,
  suggestCouncilId,
  toCouncilInput,
  validateDraft,
  type CouncilDraft,
  type DraftMember,
  type MemberCandidate,
} from '../src/lib/councilBuilder'
import { validateCouncilManifest } from '../src/lib/councilSchema'

const candidate = (
  id: string,
  kind: 'agent' | 'skill' = 'agent',
  version = '1.2.0',
): MemberCandidate => ({ kind, id, version, name: id, source: 'mine' })

function build(count: number): DraftMember[] {
  let members: DraftMember[] = []
  for (let i = 0; i < count; i++) {
    const result = addMember(members, candidate(`agent-${i}`))
    assert.ok(result.ok)
    members = result.members
  }
  return members
}

function draft(members: DraftMember[]): CouncilDraft {
  return {
    id: 'review-board',
    name: 'Review board',
    description: 'Reviews code.',
    tags: 'code, review',
    instructions: 'Run the stages in order.',
    members: members.map((m) => ({ ...m, role: 'Reviewer' })),
  }
}

test('the id is suggested as a slug of the name', () => {
  assert.equal(
    suggestCouncilId('Security Review Board'),
    'security-review-board',
  )
  assert.equal(suggestCouncilId('  Ünïcode & Symbols!! '), 'unicode-symbols')
  assert.equal(suggestCouncilId('---'), '')
  assert.equal(suggestCouncilId(''), '')
  const long = suggestCouncilId('word '.repeat(40))
  assert.ok(long.length <= 48)
  assert.doesNotMatch(long, /-$/)
})

test('tags split on commas and spaces, become slugs, and lose duplicates', () => {
  assert.deepEqual(parseTags('Code Review, security,  code-review ,,'), [
    'code',
    'review',
    'security',
    'code-review',
  ])
  assert.deepEqual(parseTags(''), [])
})

test('a member is pinned to the version the candidate shows now', () => {
  const ref = pinCandidate(candidate('helper', 'skill', '3.1.4'))
  assert.deepEqual(ref, { kind: 'skill', id: 'helper', version: '3.1.4' })
  const result = addMember([], candidate('helper', 'skill', '3.1.4'))
  assert.ok(result.ok)
  assert.deepEqual(result.members[0]!.ref, ref)
})

test('new members go in the next stage and start without a role', () => {
  const members = build(3)
  assert.deepEqual(
    members.map((m) => m.order),
    [1, 2, 3],
  )
  assert.ok(members.every((m) => m.role === ''))
})

test('the same agent or skill cannot be added twice, at any version', () => {
  const first = addMember([], candidate('twin'))
  assert.ok(first.ok)
  const again = addMember(first.members, candidate('twin'))
  assert.equal(again.ok, false)
  const otherVersion = addMember(
    first.members,
    candidate('twin', 'agent', '9.0.0'),
  )
  assert.equal(otherVersion.ok, false)
  // An agent and a skill may share an id: they are separate namespaces.
  assert.ok(addMember(first.members, candidate('twin', 'skill')).ok)
})

test('a council holds at most 20 members', () => {
  const full = build(20)
  assert.equal(full.length, 20)
  const result = addMember(full, candidate('one-too-many'))
  assert.equal(result.ok, false)
  assert.match(!result.ok ? result.error : '', /at most 20/)
  assert.equal(removeMember(full, full[0]!.key).length, 19)
})

test('fewer than 2 members is reported against the members list', () => {
  const errors = validateDraft(draft(build(1)))
  assert.match(errors.members?.join(' ') ?? '', /at least 2/)
  assert.deepEqual(validateDraft(draft(build(2))), {})
})

test('stage numbers are whole numbers from 1 and keep the list sorted', () => {
  assert.equal(cleanOrder(0), 1)
  assert.equal(cleanOrder(-4), 1)
  assert.equal(cleanOrder(2.6), 3)
  assert.equal(cleanOrder(Number.NaN), 1)
  const members = build(3)
  const moved = setMemberOrder(members, members[2]!.key, 1)
  assert.deepEqual(
    moved.map((m) => m.order),
    [1, 1, 2],
  )
  assert.equal(moved[0]!.key, members[0]!.key)
  assert.equal(moved[1]!.key, members[2]!.key)
})

test('members with the same stage number are one parallel stage', () => {
  const members = setMemberOrder(build(3), 3, 1)
  const input = toCouncilInput(draft(members))
  assert.equal(input.members.filter((m) => m.order === 1).length, 2)
})

test('moving a member swaps stages with its neighbor', () => {
  const members = build(3)
  const up = moveMember(members, members[2]!.key, -1)
  assert.deepEqual(
    up.map((m) => m.key),
    [1, 3, 2],
  )
  assert.deepEqual(
    up.map((m) => m.order),
    [1, 2, 3],
  )
  assert.deepEqual(sortMembers(up), up)
  // The ends do not move past the list.
  assert.deepEqual(moveMember(members, members[0]!.key, -1), members)
  assert.deepEqual(moveMember(members, members[2]!.key, 1), members)
})

test('moving within a shared stage changes position only', () => {
  const members = setMemberOrder(build(2), 2, 1)
  const down = moveMember(members, members[0]!.key, 1)
  assert.deepEqual(
    down.map((m) => m.key),
    [2, 1],
  )
  assert.deepEqual(
    down.map((m) => m.order),
    [1, 1],
  )
})

test('roles are set per member', () => {
  const members = setMemberRole(build(2), 2, 'Auditor')
  assert.equal(members[1]!.role, 'Auditor')
  assert.equal(members[0]!.role, '')
})

test('search matches every word across name, id, description, and author', () => {
  const list: MemberCandidate[] = [
    {
      ...candidate('pdf-forms', 'skill'),
      description: 'Fill PDF forms',
      source: 'public',
      handle: 'acme',
    },
    {
      ...candidate('code-reviewer'),
      description: 'Reviews pull requests',
      source: 'public',
      handle: 'zed',
    },
  ]
  assert.deepEqual(
    filterCandidates(list, 'pdf acme').map((c) => c.id),
    ['pdf-forms'],
  )
  assert.deepEqual(
    filterCandidates(list, 'REVIEWS').map((c) => c.id),
    ['code-reviewer'],
  )
  assert.equal(filterCandidates(list, 'nothing here').length, 0)
  assert.equal(filterCandidates(list, '', 1).length, 1)
})

test('a good draft makes a private 1.0.0 input the schema accepts', () => {
  const input = toCouncilInput(draft(build(3)))
  assert.equal(input.visibility, 'private')
  assert.equal(input.version, '1.0.0')
  assert.deepEqual(input.tags, ['code', 'review'])
  const result = validateCouncilManifest({
    ...input,
    author: { uid: 'u', name: 'U', handle: 'someone', verified: false },
    stats: { updated_at: new Date().toISOString() },
  })
  assert.ok(result.ok, JSON.stringify(result.issues))
})

test('problems are filed under the field they belong to', () => {
  const members = build(2)
  const bad: CouncilDraft = {
    ...draft(members),
    id: 'Bad ID',
    name: '',
    description: '   ',
    tags: '',
    instructions: '',
    members: members.map((m, i) => ({
      ...m,
      role: i === 0 ? '' : 'x'.repeat(201),
    })),
  }
  const errors = validateDraft(bad)
  assert.ok(hasErrors(errors))
  for (const field of ['id', 'name', 'description', 'tags', 'instructions'])
    assert.ok(errors[field]?.length, `${field} should have a message`)
  assert.ok(errors['members.0.role']?.length)
  assert.match(errors['members.1.role']?.join(' ') ?? '', /200/)
  assert.equal(errors.form, undefined)
})

test('too many tags and an oversize name are caught by the schema', () => {
  const errors = validateDraft({
    ...draft(build(2)),
    name: 'n'.repeat(65),
    tags: Array.from({ length: 11 }, (_, i) => `tag${i}`).join(' '),
  })
  assert.match(errors.name?.join(' ') ?? '', /64/)
  assert.match(errors.tags?.join(' ') ?? '', /10/)
})

test('a blank council has plain messages, not schema jargon', () => {
  const errors = validateDraft({
    id: '',
    name: '',
    description: '',
    tags: '',
    instructions: '',
    members: [],
  })
  assert.deepEqual(errors.id, ['Give the council an ID.'])
  assert.deepEqual(errors.name, ['Give the council a name.'])
  assert.ok(errors.members?.length)
})

test('save errors become plain words, with the ID problem beside its field', () => {
  assert.equal(
    describeSaveError(new Error('That council ID is taken.')).field,
    'id',
  )
  assert.match(
    describeSaveError(
      Object.assign(new Error('raw'), { code: 'permission-denied' }),
    ).message,
    /Confirm your email/,
  )
  const unknown = describeSaveError(new Error('Firebase: internal (xyz).'))
  assert.doesNotMatch(unknown.message, /Firebase/)
  assert.equal(unknown.field, undefined)
})
