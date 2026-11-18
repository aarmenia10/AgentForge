import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  checkSkillPath,
  classifySkillFile,
  decodeSkillFile,
  formatItemRef,
  isIgnoredUploadPath,
  parseItemRef,
  parsePublicSkillIndex,
  parsePublicSkillVersion,
  parseSkillFrontmatter,
  SKILL_MAX_FILE_BYTES,
  SKILL_MAX_FILES,
  SKILL_MAX_PATH_DEPTH,
  SKILL_MAX_PATH_LENGTH,
  SKILL_MAX_TAGS,
  SKILL_MAX_TOTAL_BYTES,
  skillVersionPath,
  stripCommonRoot,
  utf8ByteLength,
  validateSkillManifest,
  validateSkillRecord,
  type SkillIssueCode,
} from '../src/lib/skillSchema'
import type {
  SkillFile,
  SkillIndexEntry,
  SkillRecord,
  SkillVisibility,
} from '../src/types/skill'

import { skill, SKILL_MD } from './skillFixture'

const withFiles = (extra: SkillFile[], base = skill()) => ({
  ...base,
  files: [...base.files, ...extra],
})

function codes(value: unknown): SkillIssueCode[] {
  const result = validateSkillManifest(value)
  return result.ok ? [] : result.issues.map((i) => i.code)
}

const script: SkillFile = {
  path: 'scripts/fill.py',
  kind: 'script',
  content: 'print("hi")\n',
}

test('a well-formed public skill validates', () => {
  const result = validateSkillManifest(skill())
  assert.equal(result.ok, true, JSON.stringify(result.issues))
})

test('a record adds owner_uid and review_status, and nothing else', () => {
  const record: SkillRecord = {
    ...skill(),
    owner_uid: 'u1',
    review_status: 'pending',
  }
  assert.equal(validateSkillRecord(record).ok, true)
  assert.equal(validateSkillManifest(record).ok, false)
  assert.equal(
    validateSkillRecord({ ...record, shared_with: [] }).ok,
    false,
    'shared_with is not part of a skill record',
  )
})

test('unknown fields fail the strict validator', () => {
  assert.deepEqual(codes({ ...skill(), extra: true }), ['shape'])
  const files = skill().files.map((f) => ({ ...f, sha: 'x' }))
  assert.deepEqual(codes({ ...skill(), files }), ['shape', 'shape'])
})

/* ---------- The script rule per visibility ---------- */

for (const visibility of ['private', 'friends', 'public'] as const) {
  const allowed = visibility === 'private'
  test(`a script is ${allowed ? 'allowed' : 'rejected'} in a ${visibility} skill`, () => {
    const value = withFiles([script], skill({ visibility }))
    assert.deepEqual(codes(value), allowed ? [] : ['script_not_allowed'])
  })
  test(`a shebang file disguised as reference is a script in a ${visibility} skill`, () => {
    const disguised: SkillFile = {
      path: 'notes.md',
      kind: 'script',
      content: '#!/bin/sh\necho hi\n',
    }
    assert.deepEqual(
      codes(withFiles([disguised], skill({ visibility }))),
      allowed ? [] : ['script_not_allowed'],
    )
  })
}

test('a script relabeled as reference fails with kind_mismatch in every visibility', () => {
  for (const visibility of [
    'private',
    'friends',
    'public',
  ] as SkillVisibility[]) {
    const lie: SkillFile = { ...script, kind: 'reference' }
    const found = codes(withFiles([lie], skill({ visibility })))
    assert.ok(found.includes('kind_mismatch'), `${visibility}: ${found}`)
  }
})

test('classification follows the allowlist; unknown and executable types are scripts', () => {
  assert.equal(classifySkillFile('SKILL.md', SKILL_MD), 'instructions')
  for (const p of [
    'a.md',
    'a.MARKDOWN',
    'a.txt',
    'a.csv',
    'a.json',
    'a.yaml',
    'a.yml',
    'a.toml',
    'a.xml',
    'LICENSE',
    'docs/NOTICE',
    'docs/SKILL.md',
  ])
    assert.equal(classifySkillFile(p, 'text'), 'reference', p)
  for (const p of [
    'a.py',
    'a.sh',
    'a.js',
    'a.ts',
    'a.ps1',
    'a.html',
    'a.svg',
    'a.mdx',
    'a.unknownext',
    'Makefile',
    'run',
  ])
    assert.equal(classifySkillFile(p, 'text'), 'script', p)
  assert.equal(classifySkillFile('a.txt', '#!/usr/bin/env node\n'), 'script')
  assert.equal(classifySkillFile('SKILL.md', '#!/bin/sh\n'), 'script')
})

/* ---------- Binary ---------- */

test('binary files are rejected by extension and by NUL content', () => {
  const png: SkillFile = { path: 'logo.png', kind: 'script', content: 'x' }
  assert.deepEqual(codes(withFiles([png], skill({ visibility: 'private' }))), [
    'binary_file',
  ])
  const nul: SkillFile = {
    path: 'data.txt',
    kind: 'reference',
    content: 'a\u0000b',
  }
  assert.deepEqual(codes(withFiles([nul], skill({ visibility: 'private' }))), [
    'binary_file',
  ])
})

test('decodeSkillFile accepts UTF-8 text, strips a BOM, and rejects binary', () => {
  const enc = new TextEncoder()
  const ok = decodeSkillFile('a.md', enc.encode('\uFEFFhé'))
  assert.deepEqual(ok, { ok: true, content: 'hé' })
  assert.equal(
    decodeSkillFile('a.md', new Uint8Array([0xff, 0xfe, 0x00])).ok,
    false,
  )
  assert.equal(decodeSkillFile('a.txt', enc.encode('a\u0000b')).ok, false)
  const zip = decodeSkillFile('my.skill', enc.encode('PK'))
  assert.equal(zip.ok, false)
  assert.match(zip.ok ? '' : zip.reason, /Unzip/)
  assert.equal(decodeSkillFile('a.pdf', enc.encode('%PDF')).ok, false)
  assert.equal(
    decodeSkillFile('a.md', new Uint8Array(SKILL_MAX_FILE_BYTES + 1)).ok,
    false,
  )
})

/* ---------- Paths ---------- */

test('path rules reject traversal, absolute paths, and odd names', () => {
  for (const bad of [
    '../x.md',
    'a/../x.md',
    '/etc/x.md',
    'C:/x.md',
    'c:x.md',
    'a\\b.md',
    './x.md',
    'a//b.md',
    'a/',
    '',
    '.env',
    'a/.git/config',
    'a/b?.md',
    ' lead.md',
    'tab\t.md',
    'x'.repeat(SKILL_MAX_PATH_LENGTH + 1),
    Array(SKILL_MAX_PATH_DEPTH + 1)
      .fill('d')
      .join('/'),
  ])
    assert.notEqual(checkSkillPath(bad), null, JSON.stringify(bad))
  for (const good of [
    'SKILL.md',
    'references/api.md',
    'scripts/__init__.py',
    'API Guide.md',
    'a/b/c/d/e/f.md',
    'x'.repeat(SKILL_MAX_PATH_LENGTH),
  ])
    assert.equal(checkSkillPath(good), null, good)
})

test('invalid and case-insensitively duplicate paths fail validation', () => {
  const bad: SkillFile = { path: '../up.md', kind: 'reference', content: 'x' }
  assert.deepEqual(codes(withFiles([bad])), ['path_invalid'])
  const dup: SkillFile = {
    path: 'References/Fields.md',
    kind: 'reference',
    content: 'x',
  }
  assert.deepEqual(codes(withFiles([dup])), ['path_duplicate'])
})

/* ---------- Limits ---------- */

const filler = (n: number, bytes: number): SkillFile[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `ref/${i}.txt`,
    kind: 'reference' as const,
    content: 'a'.repeat(bytes),
  }))

test('file-count cap: exactly the cap passes, one more fails', () => {
  const base = skill({ files: skill().files.slice(0, 1) })
  assert.deepEqual(codes(withFiles(filler(SKILL_MAX_FILES - 1, 1), base)), [])
  assert.deepEqual(codes(withFiles(filler(SKILL_MAX_FILES, 1), base)), [
    'too_many_files',
  ])
})

test('per-file cap is counted in UTF-8 bytes', () => {
  const at = (content: string): SkillFile[] => [
    { path: 'big.txt', kind: 'reference', content },
  ]
  assert.deepEqual(codes(withFiles(at('a'.repeat(SKILL_MAX_FILE_BYTES)))), [])
  assert.deepEqual(codes(withFiles(at('a'.repeat(SKILL_MAX_FILE_BYTES + 1)))), [
    'file_too_large',
  ])
  // 'é' is two bytes: half as many characters reach the same limit.
  assert.deepEqual(
    codes(withFiles(at('é'.repeat(SKILL_MAX_FILE_BYTES / 2 + 1)))),
    ['file_too_large'],
  )
})

test('total size cap: exactly the cap passes, one byte more fails', () => {
  const base = skill({ files: skill().files.slice(0, 1) })
  const used = utf8ByteLength(SKILL_MD)
  const remaining = SKILL_MAX_TOTAL_BYTES - used
  const half = Math.floor(remaining / 2)
  const fit = [
    { path: 'a.txt', kind: 'reference' as const, content: 'a'.repeat(half) },
    {
      path: 'b.txt',
      kind: 'reference' as const,
      content: 'a'.repeat(remaining - half),
    },
  ]
  assert.deepEqual(codes(withFiles(fit, base)), [])
  fit[1].content += 'a'
  assert.deepEqual(codes(withFiles(fit, base)), ['skill_too_large'])
})

test('utf8ByteLength matches TextEncoder', () => {
  for (const s of ['', 'abc', 'é', '€', '😀', 'a😀é€', '\ud800x'])
    assert.equal(utf8ByteLength(s), new TextEncoder().encode(s).length, s)
})

test('tags: at least one, at most the cap, lowercase, unique', () => {
  assert.deepEqual(codes(skill({ tags: [] })), ['shape'])
  const many = Array.from({ length: SKILL_MAX_TAGS }, (_, i) => `t${i}`)
  assert.deepEqual(codes(skill({ tags: many })), [])
  assert.deepEqual(codes(skill({ tags: [...many, 'extra'] })), ['shape'])
  assert.deepEqual(codes(skill({ tags: ['Docs'] })), ['shape'])
  assert.deepEqual(codes(skill({ tags: ['a', 'a'] })), ['shape'])
})

/* ---------- SKILL.md and frontmatter ---------- */

test('SKILL.md must exist at the root with exact case', () => {
  const files = skill().files.slice(1)
  assert.deepEqual(codes(skill({ files })), ['missing_instructions'])
  const lower: SkillFile[] = [
    { path: 'skill.md', kind: 'reference', content: SKILL_MD },
    ...files,
  ]
  const result = validateSkillManifest(skill({ files: lower }))
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.issues[0].message, /Rename skill\.md/)
})

test('name and description must equal the SKILL.md frontmatter', () => {
  assert.deepEqual(codes(skill({ name: 'other-name' })), ['name_mismatch'])
  assert.deepEqual(codes(skill({ description: 'Something else.' })), [
    'description_mismatch',
  ])
  const broken = skill().files.map((f) =>
    f.path === 'SKILL.md' ? { ...f, content: '# No frontmatter\n' } : f,
  )
  assert.deepEqual(codes(skill({ files: broken })), ['frontmatter'])
})

test('name follows the Agent Skills rule; description is capped', () => {
  const md = (name: string, description: string) =>
    skill({
      name,
      description,
      files: [
        {
          path: 'SKILL.md',
          kind: 'instructions',
          content: `---\nname: ${name}\ndescription: ${description}\n---\n`,
        },
      ],
    })
  assert.deepEqual(codes(md('a'.repeat(64), 'ok')), [])
  assert.ok(codes(md('a'.repeat(65), 'ok')).includes('shape'))
  assert.ok(codes(md('PDF Forms', 'ok')).includes('shape'))
  assert.deepEqual(codes(md('ok', 'd'.repeat(1024))), [])
  assert.ok(codes(md('ok', 'd'.repeat(1025))).includes('shape'))
})

test('frontmatter parser handles the forms skills use', () => {
  const parse = (body: string) => parseSkillFrontmatter(`---\n${body}\n---\n`)
  assert.deepEqual(parse('name: a\ndescription: plain text # note'), {
    ok: true,
    value: { name: 'a', description: 'plain text' },
  })
  assert.deepEqual(parse(`name: "a"\ndescription: 'it''s "q"'`), {
    ok: true,
    value: { name: 'a', description: `it's "q"` },
  })
  assert.deepEqual(parse('name: a\ndescription: >-\n  one\n  two\n'), {
    ok: true,
    value: { name: 'a', description: 'one two' },
  })
  assert.deepEqual(parse('name: a\ndescription: |\n  one\n  two'), {
    ok: true,
    value: { name: 'a', description: 'one\ntwo' },
  })
  assert.deepEqual(parse('name: a\ndescription: one\n  two\nlicense: MIT'), {
    ok: true,
    value: { name: 'a', description: 'one two' },
  })
  assert.deepEqual(
    parse('name: a\nmetadata:\n  name: nested\ndescription: d'),
    { ok: true, value: { name: 'a', description: 'd' } },
  )
  assert.equal(
    parseSkillFrontmatter('---\r\nname: a\r\ndescription: d\r\n---\r\n').ok,
    true,
  )
  assert.equal(parse('name: a\nname: b\ndescription: d').ok, false)
  assert.equal(parse('description: d').ok, false)
  assert.equal(parse('name: a\ndescription: "open').ok, false)
  assert.equal(parseSkillFrontmatter('name: a\n').ok, false)
  assert.equal(parseSkillFrontmatter('---\nname: a\n').ok, false)
})

/* ---------- Upload helpers ---------- */

test('folder uploads lose their top folder; hidden and cache files are skipped', () => {
  assert.deepEqual(stripCommonRoot(['s/SKILL.md', 's/ref/a.md']), [
    'SKILL.md',
    'ref/a.md',
  ])
  assert.deepEqual(stripCommonRoot(['SKILL.md', 'a.md']), ['SKILL.md', 'a.md'])
  assert.deepEqual(stripCommonRoot(['a/SKILL.md', 'b/x.md']), [
    'a/SKILL.md',
    'b/x.md',
  ])
  assert.ok(isIgnoredUploadPath('.DS_Store'))
  assert.ok(isIgnoredUploadPath('scripts/__pycache__/x.pyc'))
  assert.ok(isIgnoredUploadPath('.git/HEAD'))
  assert.ok(!isIgnoredUploadPath('references/a.md'))
})

/* ---------- Public readers ---------- */

function indexEntry(overrides: Partial<SkillIndexEntry> = {}): SkillIndexEntry {
  const { files, ...rest } = skill()
  return {
    ...rest,
    files: files.map((f) => ({
      path: f.path,
      kind: f.kind,
      bytes: utf8ByteLength(f.content),
    })),
    ...overrides,
  }
}

test('public index reader ignores unknown fields but enforces public, unique, no scripts', () => {
  const entry = { ...indexEntry(), thumbs_up: 3 }
  const parsed = parsePublicSkillIndex({
    skill_schema_version: 1,
    skills: [entry],
    generated_by: 'future',
  })
  assert.equal(parsed.skills.length, 1)
  assert.equal('thumbs_up' in parsed.skills[0], false)
  assert.throws(() => parsePublicSkillIndex([entry]), /skill_schema_version/)
  assert.throws(() =>
    parsePublicSkillIndex({
      skill_schema_version: 1,
      skills: [indexEntry({ visibility: 'friends' })],
    }),
  )
  assert.throws(() =>
    parsePublicSkillIndex({
      skill_schema_version: 1,
      skills: [indexEntry(), indexEntry()],
    }),
  )
  const scripted = indexEntry()
  scripted.files = [
    ...scripted.files,
    { path: 'run.py', kind: 'script', bytes: 1 },
  ]
  assert.throws(
    () =>
      parsePublicSkillIndex({ skill_schema_version: 1, skills: [scripted] }),
    /scripts/,
  )
  const huge = indexEntry()
  const mislabeled = indexEntry()
  mislabeled.files.push({ path: 'helper.py', kind: 'reference', bytes: 4 })
  assert.throws(
    () =>
      parsePublicSkillIndex({ skill_schema_version: 1, skills: [mislabeled] }),
    /file kind mismatch/,
  )
  huge.files = [
    ...huge.files,
    { path: 'big.txt', kind: 'reference', bytes: SKILL_MAX_TOTAL_BYTES },
  ]
  assert.throws(() =>
    parsePublicSkillIndex({ skill_schema_version: 1, skills: [huge] }),
  )
})

test('public version reader requires the exact id and version, public, and valid content', () => {
  const value = { ...skill(), future_field: 1 }
  assert.equal(
    parsePublicSkillVersion(value, 'pdf-forms', '1.0.0').version,
    '1.0.0',
  )
  assert.throws(
    () => parsePublicSkillVersion(value, 'pdf-forms', '1.0.1'),
    /no version substitution/,
  )
  assert.throws(() =>
    parsePublicSkillVersion(
      skill({ visibility: 'private' }),
      'pdf-forms',
      '1.0.0',
    ),
  )
  assert.throws(() =>
    parsePublicSkillVersion(withFiles([script]), 'pdf-forms', '1.0.0'),
  )
  assert.throws(() =>
    parsePublicSkillVersion('<!doctype html>', 'pdf-forms', '1.0.0'),
  )
  assert.equal(
    skillVersionPath('pdf-forms', '1.0.0+b.1'),
    'skills/pdf-forms/1.0.0%2Bb.1.json',
  )
})

/* ---------- Item references ---------- */

test('item references round-trip and are always pinned', () => {
  const ref = parseItemRef('skill:pdf-forms@1.2.0-rc.1+build.5')
  assert.deepEqual(ref, {
    kind: 'skill',
    id: 'pdf-forms',
    version: '1.2.0-rc.1+build.5',
  })
  assert.equal(formatItemRef(ref), 'skill:pdf-forms@1.2.0-rc.1+build.5')
  assert.equal(
    formatItemRef({ kind: 'agent', id: 'a', version: '1.0.0' }),
    'agent:a@1.0.0',
  )
  for (const bad of [
    'skill:pdf-forms',
    'pdf-forms@1.0.0',
    'council:x@1.0.0',
    'skill:PDF@1.0.0',
    'skill:a@1.0',
    'skill:a@1.0.0@2.0.0',
    'Skill:a@1.0.0',
  ])
    assert.throws(() => parseItemRef(bad), bad)
})

/* ---------- Worker safety ---------- */

test('skillSchema imports nothing that a Worker cannot run', () => {
  const source = readFileSync(
    new URL('../src/lib/skillSchema.ts', import.meta.url),
    'utf8',
  )
  const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(imports.sort(), [
    '../types/skill',
    './manifestSchema',
    'zod',
  ])
  assert.doesNotMatch(
    source,
    /\bnode:|\bajv\b|\bprocess\.|\bBuffer\b|require\(/,
  )
})
