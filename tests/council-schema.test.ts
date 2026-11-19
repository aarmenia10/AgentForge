import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  checkCouncil,
  councilTotalBytes,
  councilVersionPath,
  formatCouncilRef,
  parseCouncilRef,
  parsePublicCouncilIndex,
  parsePublicCouncilVersion,
  validateCouncilManifest,
  validateCouncilRecord,
  COUNCIL_DESCRIPTION_MAX,
  COUNCIL_MAX_INSTRUCTIONS_BYTES,
  COUNCIL_MAX_MEMBERS,
  COUNCIL_MAX_TAGS,
  COUNCIL_MAX_TOTAL_BYTES,
  COUNCIL_MIN_MEMBERS,
  COUNCIL_NAME_MAX,
  COUNCIL_ORIGIN_APP_MAX,
  COUNCIL_ROLE_MAX,
  COUNCIL_SCHEMA_VERSION,
  type CouncilIssueCode,
} from '../src/lib/councilSchema'
import type {
  CouncilIndexEntry,
  CouncilManifest,
  CouncilMember,
  CouncilRecord,
  CouncilVisibility,
} from '../src/types/council'
import type { ItemRef } from '../src/types/skill'

function sampleCouncil(
  overrides: Partial<CouncilManifest> = {},
): CouncilManifest {
  return {
    council_schema_version: COUNCIL_SCHEMA_VERSION,
    visibility: 'public',
    id: 'security-audit-team',
    version: '1.0.0',
    name: 'Security Audit Team',
    description: 'A coordinated team of security analyzer agents and skills.',
    author: {
      uid: 'u_lead_1',
      name: 'Security Ops',
      handle: 'secops',
      verified: true,
    },
    tags: ['security', 'auditing', 'code-review'],
    origin_app: 'claude',
    instructions:
      'Phase 1: Run static-analyzer on repository files.\nPhase 2: Pass findings to vulnerability-scanner for CVE checking.\nPhase 3: Synthesize remediation report.',
    members: [
      {
        ref: { kind: 'agent', id: 'static-analyzer', version: '1.2.0' },
        role: 'Static code analyzer',
        order: 1,
      },
      {
        ref: { kind: 'skill', id: 'vulnerability-db', version: '2.0.1' },
        role: 'CVE database lookup specialist',
        order: 2,
      },
    ],
    stats: {
      updated_at: '2026-11-19T00:00:00Z',
    },
    ...overrides,
  }
}

function issueCodes(
  value: unknown,
  options?: { isMemberApproved?: (ref: ItemRef) => boolean },
): CouncilIssueCode[] {
  const result = validateCouncilManifest(value, options)
  return result.ok ? [] : result.issues.map((i) => i.code)
}

test('a well-formed public council validates', () => {
  const council = sampleCouncil()
  const result = validateCouncilManifest(council)
  assert.equal(result.ok, true, JSON.stringify(result.issues))
  if (result.ok) {
    assert.equal(result.value.id, 'security-audit-team')
    assert.equal(result.value.council_schema_version, 1)
  }
})

test('a record adds owner_uid, review_status, and optional saved_from_chat, and nothing else', () => {
  const record: CouncilRecord = {
    ...sampleCouncil(),
    owner_uid: 'u_lead_1',
    review_status: 'pending',
    saved_from_chat: true,
  }
  assert.equal(validateCouncilRecord(record).ok, true)
  assert.equal(
    validateCouncilManifest(record).ok,
    false,
    'manifest must not have record fields',
  )

  // Rejects shared_with (not in council record)
  assert.equal(
    validateCouncilRecord({ ...record, shared_with: [] } as unknown).ok,
    false,
    'shared_with is not part of a council record',
  )
})

test('unknown fields fail the strict validator for writers', () => {
  assert.ok(
    issueCodes({ ...sampleCouncil(), unexpected_field: 'bad' }).includes(
      'shape',
    ),
  )
  const membersWithExtra = sampleCouncil().members.map((m) => ({
    ...m,
    extra_field: 123,
  }))
  assert.ok(
    issueCodes({ ...sampleCouncil(), members: membersWithExtra }).includes(
      'shape',
    ),
  )
})

/* ---------- Limits Coverage ---------- */

test('council name limits: empty, whitespace-only, or exceeding max characters', () => {
  assert.ok(issueCodes(sampleCouncil({ name: '' })).includes('shape'))
  assert.ok(issueCodes(sampleCouncil({ name: '   ' })).includes('shape'))
  assert.ok(
    issueCodes(
      sampleCouncil({ name: 'a'.repeat(COUNCIL_NAME_MAX + 1) }),
    ).includes('shape'),
  )
  assert.equal(
    validateCouncilManifest(
      sampleCouncil({ name: 'a'.repeat(COUNCIL_NAME_MAX) }),
    ).ok,
    true,
  )
})

test('council description limits: empty, whitespace-only, or exceeding max characters', () => {
  assert.ok(issueCodes(sampleCouncil({ description: '' })).includes('shape'))
  assert.ok(issueCodes(sampleCouncil({ description: '   ' })).includes('shape'))
  assert.ok(
    issueCodes(
      sampleCouncil({
        description: 'a'.repeat(COUNCIL_DESCRIPTION_MAX + 1),
      }),
    ).includes('shape'),
  )
  assert.equal(
    validateCouncilManifest(
      sampleCouncil({ description: 'a'.repeat(COUNCIL_DESCRIPTION_MAX) }),
    ).ok,
    true,
  )
})

test('council tags limits: 1 to 10 unique lowercase slugs', () => {
  assert.ok(issueCodes(sampleCouncil({ tags: [] })).includes('shape'))
  assert.ok(
    issueCodes(
      sampleCouncil({
        tags: Array.from(
          { length: COUNCIL_MAX_TAGS + 1 },
          (_, i) => `tag-${i}`,
        ),
      }),
    ).includes('shape'),
  )
  assert.ok(
    issueCodes(sampleCouncil({ tags: ['security', 'security'] })).includes(
      'shape',
    ),
    'duplicate tags fail',
  )
  assert.ok(
    issueCodes(sampleCouncil({ tags: ['UPPERCASE'] })).includes('shape'),
    'uppercase tag fails slug regex',
  )
})

test('origin_app limits: valid slug, invalid characters, length', () => {
  assert.equal(
    validateCouncilManifest(sampleCouncil({ origin_app: 'claude' })).ok,
    true,
  )
  assert.equal(
    validateCouncilManifest(sampleCouncil({ origin_app: 'chat_gpt-v1' })).ok,
    true,
  )
  assert.ok(
    issueCodes(sampleCouncil({ origin_app: 'Claude with spaces' })).includes(
      'shape',
    ),
  )
  assert.ok(
    issueCodes(
      sampleCouncil({
        origin_app: 'a'.repeat(COUNCIL_ORIGIN_APP_MAX + 1),
      }),
    ).includes('shape'),
  )
})

test('member count limits: min 2, max 20', () => {
  const member1: CouncilMember = {
    ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
    role: 'Role 1',
    order: 1,
  }
  const member2: CouncilMember = {
    ref: { kind: 'skill', id: 's2', version: '1.0.0' },
    role: 'Role 2',
    order: 2,
  }

  // 0 members
  assert.ok(issueCodes(sampleCouncil({ members: [] })).includes('member_count'))
  // 1 member (< COUNCIL_MIN_MEMBERS)
  assert.ok(
    issueCodes(sampleCouncil({ members: [member1] })).includes('member_count'),
  )

  // Exactly 2 members (COUNCIL_MIN_MEMBERS)
  assert.equal(COUNCIL_MIN_MEMBERS, 2)
  assert.equal(
    validateCouncilManifest(sampleCouncil({ members: [member1, member2] })).ok,
    true,
  )

  // 21 members (> COUNCIL_MAX_MEMBERS)
  const twentyOneMembers: CouncilMember[] = Array.from(
    { length: COUNCIL_MAX_MEMBERS + 1 },
    (_, i) => ({
      ref: { kind: 'agent', id: `agent-${i}`, version: '1.0.0' },
      role: `Role ${i}`,
      order: i + 1,
    }),
  )
  assert.ok(
    issueCodes(sampleCouncil({ members: twentyOneMembers })).includes(
      'member_count',
    ),
  )

  // Exactly 20 members (COUNCIL_MAX_MEMBERS)
  const twentyMembers = twentyOneMembers.slice(0, COUNCIL_MAX_MEMBERS)
  assert.equal(
    validateCouncilManifest(sampleCouncil({ members: twentyMembers })).ok,
    true,
  )
})

test('member role limits: non-empty and max characters', () => {
  const badRoleEmpty: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
      role: '   ',
      order: 1,
    },
    {
      ref: { kind: 'skill', id: 's2', version: '1.0.0' },
      role: 'Valid Role',
      order: 2,
    },
  ]
  assert.ok(
    issueCodes(sampleCouncil({ members: badRoleEmpty })).includes('shape'),
  )

  const badRoleTooLong: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
      role: 'x'.repeat(COUNCIL_ROLE_MAX + 1),
      order: 1,
    },
    {
      ref: { kind: 'skill', id: 's2', version: '1.0.0' },
      role: 'Valid Role',
      order: 2,
    },
  ]
  assert.ok(
    issueCodes(sampleCouncil({ members: badRoleTooLong })).includes('shape'),
  )
})

test('member order limits: positive integer >= 1', () => {
  const badOrderZero: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
      role: 'Role 1',
      order: 0,
    },
    {
      ref: { kind: 'skill', id: 's2', version: '1.0.0' },
      role: 'Role 2',
      order: 1,
    },
  ]
  assert.ok(
    issueCodes(sampleCouncil({ members: badOrderZero })).includes('shape'),
  )

  const badOrderFloat: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
      role: 'Role 1',
      order: 1.5,
    },
    {
      ref: { kind: 'skill', id: 's2', version: '1.0.0' },
      role: 'Role 2',
      order: 2,
    },
  ]
  assert.ok(
    issueCodes(sampleCouncil({ members: badOrderFloat })).includes('shape'),
  )

  // Same order (parallel execution stage) is permitted
  const parallelOrders: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'a1', version: '1.0.0' },
      role: 'Role 1',
      order: 1,
    },
    {
      ref: { kind: 'skill', id: 's2', version: '1.0.0' },
      role: 'Role 2',
      order: 1,
    },
  ]
  assert.equal(
    validateCouncilManifest(sampleCouncil({ members: parallelOrders })).ok,
    true,
  )
})

test('duplicate members within a council fail validation', () => {
  const duplicateMembers: CouncilMember[] = [
    {
      ref: { kind: 'agent', id: 'static-analyzer', version: '1.2.0' },
      role: 'First pass analyzer',
      order: 1,
    },
    {
      ref: { kind: 'agent', id: 'static-analyzer', version: '1.2.0' },
      role: 'Second pass analyzer',
      order: 2,
    },
  ]
  assert.ok(
    issueCodes(sampleCouncil({ members: duplicateMembers })).includes(
      'duplicate_member',
    ),
  )
})

test('instructions limits: cannot be empty or exceed 100 KB', () => {
  assert.ok(
    issueCodes(sampleCouncil({ instructions: '' })).includes(
      'instructions_empty',
    ),
  )
  assert.ok(
    issueCodes(sampleCouncil({ instructions: '   ' })).includes(
      'instructions_empty',
    ),
  )

  // Exceeds 100 KB
  const oversizedInstructions = 'x'.repeat(COUNCIL_MAX_INSTRUCTIONS_BYTES + 1)
  assert.ok(
    issueCodes(sampleCouncil({ instructions: oversizedInstructions })).includes(
      'instructions_too_large',
    ),
  )

  // Within 100 KB
  const maxValidInstructions = 'x'.repeat(COUNCIL_MAX_INSTRUCTIONS_BYTES)
  assert.equal(
    validateCouncilManifest(
      sampleCouncil({ instructions: maxValidInstructions }),
    ).ok,
    true,
  )
})

test('total council size cannot exceed 200 KB', () => {
  // Near instructions cap (100 KB) + oversized description
  const bigInstructions = 'x'.repeat(100 * 1024)
  const bigDesc = 'y'.repeat(COUNCIL_DESCRIPTION_MAX)
  const base = sampleCouncil({
    instructions: bigInstructions,
    description: bigDesc,
  })

  // Measure total size
  const total = councilTotalBytes(base)
  assert.ok(total < COUNCIL_MAX_TOTAL_BYTES)

  // Total size exceeding 200 KB
  const oversizedMembers: CouncilMember[] = Array.from(
    { length: 20 },
    (_, i) => ({
      ref: { kind: 'agent', id: `agent-${i}`, version: '1.0.0' },
      role: 'r'.repeat(COUNCIL_ROLE_MAX),
      order: i + 1,
    }),
  )
  const bigCouncil = sampleCouncil({
    instructions: 'i'.repeat(100 * 1024),
    members: oversizedMembers,
  })
  // If instructions + members + metadata > 200 KB, total_too_large is flagged
  const issues = checkCouncil({
    ...bigCouncil,
    instructions: 'i'.repeat(COUNCIL_MAX_TOTAL_BYTES + 100),
  })
  assert.ok(issues.some((i) => i.code === 'total_too_large'))
})

/* ---------- The Public-Members Rule ---------- */

test('public council requires every member to be public and approved', () => {
  const approvedRefs = new Set(['agent:static-analyzer@1.2.0'])
  const isMemberApproved = (ref: ItemRef) =>
    approvedRefs.has(`${ref.kind}:${ref.id}@${ref.version}`)

  const council = sampleCouncil({ visibility: 'public' })

  // Member 2 (skill:vulnerability-db@2.0.1) is not in approvedRefs
  const issues = issueCodes(council, { isMemberApproved })
  assert.ok(
    issues.includes('member_not_public_approved'),
    'unapproved member in public council must fail',
  )

  // When both members are approved, validation succeeds
  approvedRefs.add('skill:vulnerability-db@2.0.1')
  assert.equal(validateCouncilManifest(council, { isMemberApproved }).ok, true)
})

test('private and friends councils permit private/unapproved members', () => {
  const isMemberApproved = () => false // None approved

  for (const visibility of ['private', 'friends'] as CouncilVisibility[]) {
    const council = sampleCouncil({ visibility })
    const result = validateCouncilManifest(council, { isMemberApproved })
    assert.equal(
      result.ok,
      true,
      `${visibility} council should allow unapproved or private members`,
    )
  }
})

/* ---------- Public Files Readers ---------- */

test('parsePublicCouncilIndex parses valid index and ignores unknown fields', () => {
  const validEntry: CouncilIndexEntry = {
    council_schema_version: 1,
    visibility: 'public',
    id: 'sec-audit',
    version: '1.0.0',
    name: 'Sec Audit',
    description: 'Sec Audit desc',
    author: {
      uid: 'u1',
      name: 'Sec Author',
      handle: 'secauthor',
      verified: true,
    },
    tags: ['security'],
    origin_app: 'claude',
    members: [
      {
        ref: { kind: 'agent', id: 'scanner', version: '1.0.0' },
        role: 'Scanner',
        order: 1,
      },
      {
        ref: { kind: 'skill', id: 'rules', version: '1.0.0' },
        role: 'Rule checker',
        order: 2,
      },
    ],
    stats: { updated_at: '2026-11-19T00:00:00Z' },
    instructions_bytes: 512,
    member_count: 2,
  }

  const rawIndex = {
    council_schema_version: 1,
    unknown_top_field: 'ignored',
    councils: [
      {
        ...validEntry,
        unknown_entry_field: 'ignored',
      },
    ],
  }

  const parsed = parsePublicCouncilIndex(rawIndex)
  assert.equal(parsed.councils.length, 1)
  assert.equal(parsed.councils[0].id, 'sec-audit')
})

test('parsePublicCouncilIndex rejects unsupported schema version or non-public entries', () => {
  const index = {
    council_schema_version: 999,
    councils: [],
  }
  assert.throws(
    () => parsePublicCouncilIndex(index),
    /unsupported council_schema_version/,
  )

  const nonPublicIndex = {
    council_schema_version: 1,
    councils: [
      {
        ...sampleCouncil({ visibility: 'private' }),
        instructions_bytes: 10,
        member_count: 2,
      },
    ],
  }
  assert.throws(
    () => parsePublicCouncilIndex(nonPublicIndex),
    /non-public council/,
  )
})

test('parsePublicCouncilIndex enforces public-members rule when options provided', () => {
  const entry: CouncilIndexEntry = {
    council_schema_version: 1,
    visibility: 'public',
    id: 'sec-audit',
    version: '1.0.0',
    name: 'Sec Audit',
    description: 'Sec Audit desc',
    author: {
      uid: 'u1',
      name: 'Sec Author',
      handle: 'secauthor',
      verified: true,
    },
    tags: ['security'],
    members: [
      {
        ref: { kind: 'agent', id: 'scanner', version: '1.0.0' },
        role: 'Scanner',
        order: 1,
      },
      {
        ref: { kind: 'skill', id: 'rules', version: '1.0.0' },
        role: 'Rule checker',
        order: 2,
      },
    ],
    stats: { updated_at: '2026-11-19T00:00:00Z' },
    instructions_bytes: 512,
    member_count: 2,
  }

  const index = {
    council_schema_version: 1,
    councils: [entry],
  }

  // Scanner approved, rules not approved -> throws
  assert.throws(
    () =>
      parsePublicCouncilIndex(index, {
        isMemberApproved: (ref) => ref.id === 'scanner',
      }),
    /contains non-approved member/,
  )

  // Both approved -> succeeds
  assert.doesNotThrow(() =>
    parsePublicCouncilIndex(index, {
      isMemberApproved: () => true,
    }),
  )
})

test('parsePublicCouncilVersion reads version file, ignores unknown fields, and enforces matching id and version', () => {
  const council = sampleCouncil()
  const rawPayload = {
    ...council,
    unknown_version_field: 'ignored',
  }

  const read = parsePublicCouncilVersion(
    rawPayload,
    council.id,
    council.version,
  )
  assert.equal(read.id, council.id)
  assert.equal(read.version, council.version)

  // Mismatched id fails
  assert.throws(
    () =>
      parsePublicCouncilVersion(rawPayload, 'different-id', council.version),
    /Council\/version not found/,
  )

  // Mismatched version fails
  assert.throws(
    () => parsePublicCouncilVersion(rawPayload, council.id, '2.0.0'),
    /Council\/version not found/,
  )
})

/* ---------- Reference & Path Helpers ---------- */

test('councilVersionPath encodes URI characters properly', () => {
  assert.equal(
    councilVersionPath('my-team', '1.0.0'),
    'councils/my-team/1.0.0.json',
  )
  assert.equal(
    councilVersionPath('team/one', '1.0.0+patch'),
    'councils/team%2Fone/1.0.0%2Bpatch.json',
  )
})

test('formatCouncilRef and parseCouncilRef round-trip accurately', () => {
  const ref = formatCouncilRef('audit-council', '1.2.3')
  assert.equal(ref, 'council:audit-council@1.2.3')

  const parsed = parseCouncilRef(ref)
  assert.deepEqual(parsed, {
    kind: 'council',
    id: 'audit-council',
    version: '1.2.3',
  })

  assert.throws(
    () => parseCouncilRef('agent:audit-council@1.2.3'),
    /Expected a council reference/,
  )
  assert.throws(
    () => parseCouncilRef('council:INVALID_ID@1.2.3'),
    /Invalid council reference/,
  )
})

/* ---------- Module Purity Check ---------- */

test('src/lib/councilSchema.ts imports only zod and Node-free schema modules', () => {
  const source = readFileSync('src/lib/councilSchema.ts', 'utf-8')
  assert.doesNotMatch(source, /from ['"]node:/)
  assert.doesNotMatch(source, /from ['"]fs['"]/)
  assert.doesNotMatch(source, /from ['"]path['"]/)
  assert.doesNotMatch(source, /from ['"]ajv/)
  assert.doesNotMatch(source, /\bBuffer\b/)
  assert.doesNotMatch(source, /\bprocess\b/)
})
