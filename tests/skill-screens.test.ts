import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ARCHIVE_MESSAGE,
  canSave,
  checkDraft,
  compareSkills,
  diffLines,
  draftFiles,
  draftFromRecord,
  effectiveId,
  emptySkillDraft,
  foldDiff,
  loadPrompt,
  parseTags,
  readUpload,
  saveLabel,
  toIndexEntry,
  type SkillDraft,
  type UploadEntry,
} from '../src/components/skills/skillDraft'
import {
  changeSkillVisibility,
  fetchReviewPage,
  loadFriendSkills,
  loadMyPendingEdits,
  loadSkillForEdit,
  runReviewDecision,
  saveSkill,
  ScreenError,
  type SkillsApi,
} from '../src/components/skills/skillActions'
import { reviewFindings } from '../src/components/skills/reviewFindings'
import {
  createSkillRepository,
  querySkills,
  DEFAULT_SKILL_QUERY,
} from '../src/lib/skillRepository'
import { describeServiceError } from '../src/lib/studioErrors'
import { createSkillStore } from '../src/services/skillStore'
import type {
  SkillFile,
  SkillIndexEntry,
  SkillRecord,
} from '../src/types/skill'

const ROOT = resolve(import.meta.dirname, '..')
const me = { uid: 'u1', name: 'Ada', handle: 'ada' }
const enc = new TextEncoder()

const SKILL_MD = `---
name: pdf-forms
description: Fills PDF forms from a list of fields.
---

# PDF forms

Read references/fields.md first.
`

function entry(
  path: string,
  text: string | Uint8Array,
): UploadEntry & {
  reads: number
} {
  const bytes = typeof text === 'string' ? enc.encode(text) : text
  const e = {
    path,
    size: bytes.byteLength,
    reads: 0,
    read: async () => {
      e.reads++
      return bytes
    },
  }
  return e
}

function record(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    skill_schema_version: 1,
    visibility: 'public',
    id: 'pdf-forms',
    version: '1.0.0',
    name: 'pdf-forms',
    description: 'Fills PDF forms from a list of fields.',
    author: { uid: 'u1', name: 'Ada', handle: 'ada', verified: false },
    tags: ['forms'],
    files: [
      { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
      {
        path: 'references/fields.md',
        kind: 'reference',
        content: '# Fields\n\nname\naddress\n',
      },
    ],
    stats: { updated_at: '2026-11-18T10:00:00.000Z' },
    owner_uid: 'u1',
    review_status: 'approved',
    ...overrides,
  }
}

function draftWith(files: SkillFile[], patch: Partial<SkillDraft> = {}) {
  return { ...emptySkillDraft(), files, tags: 'forms', ...patch }
}

/* ---------- Upload pipeline ---------- */

test('a chosen folder loses its shared root, skips tool files, and classifies each file', async () => {
  const result = await readUpload([
    entry('pdf-forms/SKILL.md', SKILL_MD),
    entry('pdf-forms/references/fields.md', '# Fields'),
    entry('pdf-forms/scripts/fill.py', 'print(1)'),
    entry('pdf-forms/.DS_Store', 'x'),
    entry('pdf-forms/.git/config', 'x'),
    entry('pdf-forms/node_modules/a/index.js', 'x'),
  ])
  assert.equal(result.refused, null)
  assert.deepEqual(
    result.files.map((f) => [f.path, f.kind]),
    [
      ['SKILL.md', 'instructions'],
      ['references/fields.md', 'reference'],
      ['scripts/fill.py', 'script'],
    ],
  )
  assert.equal(result.skipped.length, 3)
  assert.deepEqual(result.rejected, [])
})

test('a .zip or .skill file is refused with the unzip sentence', async () => {
  for (const name of ['pdf-forms.zip', 'pdf-forms.skill', 'PDF.ZIP']) {
    const result = await readUpload([entry(name, 'PK')])
    assert.equal(result.files.length, 0)
    assert.deepEqual(result.rejected, [
      { path: name, reason: 'Unzip it and choose the folder instead.' },
    ])
    assert.match(
      result.refused ?? '',
      /Unzip it and choose the folder instead\./,
    )
  }
  assert.equal(ARCHIVE_MESSAGE, 'Unzip it and choose the folder instead.')
})

test('more than 50 files are refused before any file is read', async () => {
  const many = Array.from({ length: 51 }, (_, i) => entry(`s/ref-${i}.md`, 'x'))
  const result = await readUpload(many)
  assert.match(result.refused ?? '', /51 files.*at most 50.*Nothing was read/)
  assert.equal(
    many.reduce((n, e) => n + e.reads, 0),
    0,
  )
})

test('binary, non-UTF-8, and oversized files are rejected with a reason; a BOM is dropped', async () => {
  const big = entry('big.md', 'x'.repeat(100 * 1024 + 1))
  const result = await readUpload([
    entry('SKILL.md', `\uFEFF${SKILL_MD}`),
    entry('logo.png', new Uint8Array([137, 80, 78, 71])),
    entry('latin1.txt', new Uint8Array([0xe9, 0x41])),
    big,
  ])
  assert.deepEqual(
    result.rejected.map((r) => r.path),
    ['logo.png', 'latin1.txt', 'big.md'],
  )
  assert.equal(big.reads, 0, 'an oversized file is not read')
  assert.equal(result.files[0].content.charCodeAt(0), '-'.charCodeAt(0))
})

/* ---------- Draft checks ---------- */

test('a script blocks sharing but not a private save, with one Blocked finding beside the file', () => {
  const files: SkillFile[] = [
    { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
    { path: 'scripts/fill.py', kind: 'script', content: 'print(1)\n' },
  ]
  const priv = checkDraft(draftWith(files, { visibility: 'private' }), me)
  assert.equal(priv.problemCount, 0)
  assert.equal(priv.blocked, true)
  assert.equal(canSave(priv), true)
  const notes = priv.byFile.get('scripts/fill.py')!
  assert.deepEqual(
    notes.findings.map((f) => [f.rule, f.severity]),
    [['SK-01', 'block']],
  )

  const friends = checkDraft(draftWith(files, { visibility: 'friends' }), me)
  assert.equal(canSave(friends), false)
  // The validator's script_not_allowed twin is not repeated beside the file.
  assert.deepEqual(friends.byFile.get('scripts/fill.py')!.problems, [])
  assert.deepEqual(friends.scripts, ['scripts/fill.py'])
  assert.equal(saveLabel('public', null), 'Submit for public review')
})

test('the form reads name and description from SKILL.md and the id follows the name until typed', () => {
  const draft = draftWith([
    { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
  ])
  assert.equal(effectiveId(draft), 'pdf-forms')
  const check = checkDraft(draft, me)
  assert.equal(check.manifest.name, 'pdf-forms')
  assert.equal(
    check.manifest.description,
    'Fills PDF forms from a list of fields.',
  )
  assert.equal(check.problemCount, 0)
  assert.equal(effectiveId({ ...draft, id: 'mine', idTouched: true }), 'mine')
})

test('the text box makes a SKILL.md-only skill', () => {
  const draft = {
    ...emptySkillDraft(),
    source: 'text' as const,
    text: SKILL_MD,
    tags: 'pdf',
  }
  assert.deepEqual(
    draftFiles(draft).map((f) => [f.path, f.kind]),
    [['SKILL.md', 'instructions']],
  )
  assert.equal(canSave(checkDraft(draft, me)), true)
  // The prefilled template is itself a valid skill once it has a tag.
  assert.equal(
    checkDraft({ ...emptySkillDraft(), source: 'text', tags: 'x' }, me)
      .problemCount,
    0,
  )
})

test('missing SKILL.md, a reserved or taken id, no tags, and a too-low version are problems', () => {
  const noInstructions = checkDraft(
    draftWith([{ path: 'notes.md', kind: 'reference', content: 'x' }]),
    me,
  )
  assert.ok(noInstructions.problems.some((p) => /SKILL\.md/.test(p.message)))
  const files: SkillFile[] = [
    { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
  ]
  const reserved = checkDraft(
    draftWith(files, { id: 'new', idTouched: true }),
    me,
  )
  assert.ok(reserved.problems.some((p) => p.field === 'id'))
  const taken = checkDraft(draftWith(files), me, {
    takenIds: new Set(['pdf-forms']),
  })
  assert.ok(taken.problems.some((p) => /already uses/.test(p.message)))
  const noTags = checkDraft(draftWith(files, { tags: ' , ' }), me)
  assert.ok(noTags.problems.some((p) => p.field === 'tags'))

  const live = record()
  const sameVersion = checkDraft(draftFromRecord(live), me, { live })
  assert.ok(
    sameVersion.problems.some(
      (p) =>
        p.field === 'version' && /higher than 1\.0\.0.*1\.0\.1/.test(p.message),
    ),
  )
  const bumped = checkDraft(
    { ...draftFromRecord(live), version: '1.0.1' },
    me,
    { live },
  )
  assert.equal(bumped.problemCount, 0)
  // A private or not-yet-approved skill saves without a bump.
  const priv = record({ visibility: 'private' })
  assert.equal(
    checkDraft(draftFromRecord(priv), me, { live: priv }).problemCount,
    0,
  )
  assert.deepEqual(parseTags('PDF, pdf, Forms\nfinance'), [
    'pdf',
    'forms',
    'finance',
  ])
})

/* ---------- Comparison ---------- */

test('a waiting edit is compared file by file with a line diff', () => {
  const live = record()
  const edit = record({
    version: '1.1.0',
    files: [
      {
        path: 'SKILL.md',
        kind: 'instructions',
        content: SKILL_MD.replace('first', 'before anything'),
      },
      { path: 'references/new.md', kind: 'reference', content: 'new' },
    ],
  })
  const { meta, files } = compareSkills(live, edit)
  assert.deepEqual(
    meta.map((m) => m.label),
    ['Version'],
  )
  assert.deepEqual(
    files.map((f) => [f.path, f.status]),
    [
      ['SKILL.md', 'changed'],
      ['references/new.md', 'added'],
      ['references/fields.md', 'removed'],
    ],
  )
  const lines = diffLines('a\nb\nc', 'a\nB\nc')!
  assert.deepEqual(
    lines.map((l) => l.type),
    ['same', 'del', 'add', 'same'],
  )
  const long = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
  const folded = foldDiff(diffLines(long, long.replace('l10', 'X'))!)
  assert.ok(folded.some((l) => l.type === 'fold'))
})

/* ---------- Public files ---------- */

function fakeFetch(routes: Record<string, { status?: number; body: string }>) {
  const calls: string[] = []
  const impl = async (url: string) => {
    calls.push(url)
    const hit = routes[url]
    if (!hit)
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => '',
      }
    const status = hit.status ?? 200
    return {
      ok: status < 400,
      status,
      headers: new Headers(),
      text: async () => hit.body,
    }
  }
  return { impl, calls }
}

const indexEntry = (r: SkillRecord): SkillIndexEntry => {
  const { owner_uid: _o, review_status: _r, ...manifest } = r
  void _o
  void _r
  return toIndexEntry(manifest)
}

test('the public list reads skills.json only, and a missing file is an empty list', async () => {
  const skills = [
    indexEntry(record()),
    indexEntry(
      record({
        id: 'old',
        name: 'old',
        tags: ['finance'],
        stats: { updated_at: '2025-01-01T00:00:00.000Z' },
        files: [
          {
            path: 'SKILL.md',
            kind: 'instructions',
            content: '---\nname: old\ndescription: Old one.\n---\n',
          },
        ],
        description: 'Old one.',
      }),
    ),
  ]
  const ok = fakeFetch({
    '/skills.json': {
      body: JSON.stringify({ skill_schema_version: 1, skills, later: true }),
    },
  })
  const repo = createSkillRepository(ok.impl)
  const list = await repo.listSkills()
  assert.equal(list.state, 'ready')
  assert.equal(list.skills.length, 2)
  await repo.listSkills()
  assert.deepEqual(ok.calls, ['/skills.json'], 'cached for the session')
  assert.deepEqual(
    querySkills(list.skills, {
      ...DEFAULT_SKILL_QUERY,
      keyword: 'fields.md',
    }).map((s) => s.id),
    ['pdf-forms'],
  )
  assert.deepEqual(
    querySkills(list.skills, { ...DEFAULT_SKILL_QUERY, tag: 'finance' }).map(
      (s) => s.id,
    ),
    ['old'],
  )
  assert.deepEqual(
    querySkills(list.skills, { ...DEFAULT_SKILL_QUERY, sort: 'name' }).map(
      (s) => s.id,
    ),
    ['old', 'pdf-forms'],
  )

  const missing = await createSkillRepository(fakeFetch({}).impl).listSkills()
  assert.deepEqual(missing, { skills: [], state: 'missing' })
  const html = await createSkillRepository(
    fakeFetch({ '/skills.json': { body: '<!doctype html><html>' } }).impl,
  ).listSkills()
  assert.equal(html.state, 'missing')

  const bad = fakeFetch({
    '/skills.json': {
      body: JSON.stringify({
        skill_schema_version: 1,
        skills: [{ ...skills[0], visibility: 'friends' }],
      }),
    },
  })
  const badRepo = createSkillRepository(bad.impl)
  assert.equal((await badRepo.listSkills()).state, 'error')
  await badRepo.listSkills()
  assert.equal(bad.calls.length, 2, 'a failed read is retried')
})

test('a version file is read once, exactly, and never substituted', async () => {
  const { owner_uid: _o, review_status: _r, ...manifest } = record()
  void _o
  void _r
  const f = fakeFetch({
    '/skills/pdf-forms/1.0.0.json': { body: JSON.stringify(manifest) },
    '/skills/pdf-forms/2.0.0.json': { body: JSON.stringify(manifest) },
  })
  const repo = createSkillRepository(f.impl)
  const skill = await repo.getSkillVersion('pdf-forms', '1.0.0')
  assert.equal(skill.files.length, 2)
  await repo.getSkillVersion('pdf-forms', '1.0.0')
  assert.equal(f.calls.length, 1)
  await assert.rejects(repo.getSkillVersion('pdf-forms', '2.0.0'), /not found/)
  await assert.rejects(repo.getSkillVersion('pdf-forms', '3.0.0'), /not found/)
})

test('the skills page and detail view never import Firestore code', () => {
  for (const file of [
    'src/lib/skillRepository.ts',
    'src/pages/SkillsPage.tsx',
    'src/pages/SkillPage.tsx',
    'src/components/skills/SkillCard.tsx',
    'src/components/skills/SkillDetail.tsx',
  ]) {
    const source = readFileSync(resolve(ROOT, file), 'utf8')
    assert.doesNotMatch(source, /services\/|firebase/, file)
  }
})

/* ---------- Services, through fakes ---------- */

function fakeApi(overrides: Partial<SkillsApi> = {}): SkillsApi & {
  calls: string[]
} {
  const calls: string[] = []
  const page = { items: [] as SkillRecord[], cursor: null }
  const log =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push(
        `${name}(${args.map((a) => (a === undefined ? 'undefined' : JSON.stringify(a))).join(',')})`,
      )
      return value
    }
  return {
    calls,
    createSkill: log('createSkill', undefined),
    updateSkill: log('updateSkill', { staged: false }),
    setSkillVisibility: log('setSkillVisibility', undefined),
    getSkillRecord: log('getSkillRecord', null),
    getPendingSkillEdit: log('getPendingSkillEdit', null),
    withdrawPendingSkillEdit: log('withdrawPendingSkillEdit', undefined),
    listMySkills: log('listMySkills', page),
    listMyPendingSkillEdits: log('listMyPendingSkillEdits', page),
    listSharedSkills: log('listSharedSkills', page),
    listSkillReviewQueue: log('listSkillReviewQueue', page),
    listSkillEditQueue: log('listSkillEditQueue', page),
    reviewSkill: log('reviewSkill', undefined),
    reviewSkillEdit: log('reviewSkillEdit', undefined),
    setSkillAuthorVerified: log('setSkillAuthorVerified', undefined),
    ...overrides,
  }
}

const unavailable = () => createSkillStore(null as never, 'u1')

test('until P3-9 merges, every screen shows the stub error as a plain sentence', async () => {
  const stub = unavailable()
  const api = fakeApi({
    createSkill: stub.createSkill,
    listSharedSkills: stub.listSharedSkills,
    setSkillVisibility: stub.setSkillVisibility,
    getSkillRecord: stub.getSkillRecord,
  })
  const sentence =
    'Skills are not available yet. They open once the skills database is switched on.'
  const manifest = checkDraft(
    draftWith([{ path: 'SKILL.md', kind: 'instructions', content: SKILL_MD }]),
    me,
  ).manifest
  await assert.rejects(saveSkill(api, manifest, null), (e: Error) => {
    assert.ok(e instanceof ScreenError)
    assert.equal(e.message, sentence)
    return true
  })
  await assert.rejects(loadFriendSkills(api, 'f1', 20), { message: sentence })
  await assert.rejects(changeSkillVisibility(api, record(), 'private'), {
    message: sentence,
  })
  assert.deepEqual(await loadSkillForEdit(api, 'pdf-forms', 'u1'), {
    ok: false,
    message: sentence,
  })
})

test('saving creates, or updates and reports a staged edit', async () => {
  const api = fakeApi({ updateSkill: async () => ({ staged: true }) })
  const draft = draftWith([
    { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
  ])
  const manifest = checkDraft(draft, me).manifest
  const created = await saveSkill(api, manifest, null)
  assert.equal(created.kind, 'created')
  assert.equal(created.message, 'Saved. Only you can see it.')
  assert.match(api.calls[0], /^createSkill\(/)

  const live = record()
  const updated = await saveSkill(api, { ...manifest, version: '1.1.0' }, live)
  assert.equal(updated.kind, 'updated')
  assert.match(
    updated.message,
    /waiting for review\. Version 1\.0\.0 stays live/,
  )

  await assert.rejects(
    saveSkill(api, { ...manifest, files: [] }, null),
    /not valid/,
  )
  const taken = fakeApi({
    createSkill: async () => {
      throw new Error('Skill id is taken')
    },
  })
  await assert.rejects(saveSkill(taken, manifest, null), {
    message: 'That id is already taken. Choose another one.',
  })
})

test('editing loads the waiting edit for the owner only', async () => {
  const live = record()
  const edit = record({ version: '1.1.0', review_status: 'pending' })
  const api = fakeApi({
    getSkillRecord: async () => live,
    getPendingSkillEdit: async () => edit,
  })
  const ok = await loadSkillForEdit(api, 'pdf-forms', 'u1')
  assert.ok(ok.ok)
  assert.equal(ok.draft.version, '1.1.0')
  assert.equal(ok.draft.source, 'files')
  assert.deepEqual(await loadSkillForEdit(api, 'pdf-forms', 'u2'), {
    ok: false,
    message: 'You can only edit your own skills.',
  })
  const none = fakeApi()
  assert.match(
    ((await loadSkillForEdit(none, 'x', 'u1')) as { message: string }).message,
    /no skill with that id/,
  )
})

test('My items pages waiting edits, and visibility changes say what happens', async () => {
  let n = 0
  const api = fakeApi({
    listMyPendingSkillEdits: async (size = 20) => {
      n++
      const items = Array.from({ length: n === 1 ? size : 1 }, (_, i) =>
        record({ id: `s${n}-${i}` }),
      )
      return { items, cursor: n === 1 ? 's1-last' : null }
    },
    getSkillRecord: async () => record({ visibility: 'private' }),
  })
  const edits = await loadMyPendingEdits(api, 20)
  assert.equal(edits.size, 21)
  assert.equal(n, 2)

  const result = await changeSkillVisibility(api, record(), 'private')
  assert.equal(result.fresh?.visibility, 'private')
  assert.match(result.message, /leaves the public skills page/)
  assert.match(
    (
      await changeSkillVisibility(
        api,
        record({ visibility: 'private' }),
        'public',
      )
    ).message,
    /Sent for review/,
  )
})

test("friends' skills that break the rules are left out and counted", async () => {
  const relabelled = record({
    id: 'sneaky',
    visibility: 'friends',
    files: [
      {
        path: 'SKILL.md',
        kind: 'instructions',
        content: SKILL_MD.replace('pdf-forms', 'sneaky'),
      },
      { path: 'run.py', kind: 'reference', content: 'print(1)' },
    ],
    name: 'sneaky',
  })
  const good = record({ visibility: 'friends' })
  const api = fakeApi({
    listSharedSkills: async () => ({ items: [good, relabelled], cursor: 'x' }),
  })
  const page = await loadFriendSkills(api, 'f1', 20)
  assert.deepEqual(
    page.items.map((s) => s.id),
    ['pdf-forms'],
  )
  assert.equal(page.refused, 1)
  assert.equal(page.cursor, null, 'a short page ends the list')
})

test('review buttons call the right service', async () => {
  const api = fakeApi()
  await fetchReviewPage(api, 'submission', 20)
  await fetchReviewPage(api, 'edit', 20)
  await fetchReviewPage(api, 'published', 20, 'after')
  await runReviewDecision(api, 'submission', 'approve', 'a')
  await runReviewDecision(api, 'edit', 'reject', 'b')
  await runReviewDecision(api, 'published', 'take-down', 'c')
  assert.deepEqual(api.calls, [
    'listSkillReviewQueue("pending",20,undefined)',
    'listSkillEditQueue("pending",20,undefined)',
    'listSkillReviewQueue("approved",20,"after")',
    'reviewSkill("a","approved")',
    'reviewSkillEdit("b","rejected")',
    'reviewSkill("c","rejected")',
  ])
})

test('service errors name the skill and agent wording is unchanged', () => {
  const denied = Object.assign(new Error('x'), { code: 'permission-denied' })
  assert.equal(
    describeServiceError(denied, 'load', 'skill'),
    'You do not have access to this skill.',
  )
  assert.equal(
    describeServiceError(denied, 'load'),
    'You do not have access to this agent.',
  )
  assert.equal(
    describeServiceError(new Error('raw'), 'take-down', 'skill'),
    'Could not take this skill down. Try again.',
  )
  assert.equal(
    describeServiceError({ code: 'not-found' }, 'load', 'skill'),
    'That skill no longer exists.',
  )
})

test('reviewers see every finding and every rule problem by file', () => {
  const bad = record({
    visibility: 'public',
    files: [
      { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
      { path: 'run.sh', kind: 'script', content: '#!/bin/sh\necho hi\n' },
    ],
  })
  const review = reviewFindings(bad)
  assert.equal(review.blocks, 1)
  assert.ok(review.issues.some((i) => i.code === 'script_not_allowed'))
  assert.equal(review.byField('files["run.sh"]').findings[0].rule, 'SK-01')
  assert.equal(reviewFindings(record()).issues.length, 0)
})

/* ---------- Rendered screens ---------- */

Object.assign(globalThis, {
  window: {
    location: { pathname: '/', search: '', href: 'http://localhost/' },
    addEventListener() {},
    removeEventListener() {},
  },
})

async function render(node: () => ReactNode) {
  const { RouterProvider } = await import('../src/router/Router')
  const { AuthProvider } = await import('../src/auth/AuthProvider')
  // React separates adjacent text with comments; drop them so text matches.
  return renderToStaticMarkup(
    createElement(
      RouterProvider,
      null,
      createElement(AuthProvider, null, node()),
    ),
  ).replaceAll('<!-- -->', '')
}

const NO_PASS = /passed|✓|lucide-check\b|lucide-circle-check|badge-check/i

test('the upload screen offers every input, the limits, and the script rule', async () => {
  const { SkillUpload } = await import('../src/components/skills/SkillUpload')
  const markup = await render(() =>
    createElement(SkillUpload, { editId: null }),
  )
  for (const text of [
    'Choose folder',
    'Choose files',
    'Drop your skill folder here',
    'Write it here',
    '200 KB in all, 100 KB per file, 50 files',
    'unzip it and choose the folder instead',
    'Scripts can stay in a private skill; remove them to share it with friends or submit it for public review.',
    'of 200 KB',
    '0 of 50',
  ])
    assert.ok(markup.includes(text), text)
  assert.match(markup, /role="meter"/)
  assert.doesNotMatch(markup, NO_PASS)
})

test('file notes use Blocked and Check, never a pass mark', async () => {
  const { FileNotesView } = await import('../src/components/skills/SkillUpload')
  const check = checkDraft(
    draftWith(
      [
        { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
        { path: 'fill.py', kind: 'script', content: 'print(1)' },
      ],
      { visibility: 'public' },
    ),
    me,
  )
  const markup = await render(() =>
    createElement(FileNotesView, { check, path: 'fill.py' }),
  )
  assert.match(markup, /Blocked \(SK-01/)
  assert.match(markup, /Blocks sharing/)
  assert.doesNotMatch(markup, NO_PASS)
  const clean = await render(() =>
    createElement(FileNotesView, { check, path: 'SKILL.md' }),
  )
  assert.equal(clean, '')
})

test('a skill card links to its page and uses no pills', async () => {
  const { SkillCard } = await import('../src/components/skills/SkillCard')
  const markup = await render(() =>
    createElement(SkillCard, { skill: indexEntry(record()) }),
  )
  assert.match(markup, /href="\/skills\/pdf-forms"/)
  assert.match(markup, /href="\/u\/ada"/)
  assert.match(markup, /2 files/)
  assert.doesNotMatch(markup, /rounded-full/)
})

test('the detail view says how to use a public skill and lists the files', async () => {
  const { SkillDetail } = await import('../src/components/skills/SkillDetail')
  const markup = await render(() =>
    createElement(SkillDetail, {
      skill: indexEntry(record()),
      loadFiles: () => new Promise<SkillFile[]>(() => {}),
    }),
  )
  assert.ok(markup.includes(loadPrompt({ id: 'pdf-forms', version: '1.0.0' })))
  assert.ok(markup.includes('Use AgentLemon to find a skill for ...'))
  assert.match(markup, /references\/fields\.md/)
  assert.match(markup, /Loading the files/)
  assert.doesNotMatch(markup, NO_PASS)

  const priv = await render(() =>
    createElement(SkillDetail, {
      skill: indexEntry(record({ visibility: 'private' })),
      loadFiles: async () => [],
    }),
  )
  assert.match(priv, /used from this website/)
  assert.doesNotMatch(priv, /Connector link/)
})

test('the review view shows each file with its finding and the author label in full', async () => {
  const { SkillReviewView } =
    await import('../src/components/skills/SkillReviewQueue')
  const bad = record({
    files: [
      { path: 'SKILL.md', kind: 'instructions', content: SKILL_MD },
      { path: 'run.sh', kind: 'script', content: '#!/bin/sh\necho hi\n' },
    ],
  })
  const markup = await render(() =>
    createElement(SkillReviewView, {
      record: bad,
      review: reviewFindings(bad),
    }),
  )
  assert.match(markup, /run\.sh/)
  assert.match(markup, /Blocked \(SK-01/)
  assert.match(markup, /Not marked Verified author/)
  assert.doesNotMatch(markup, />Verified</)
})

test('the file comparison renders added and removed lines', async () => {
  const { SkillDiff } = await import('../src/components/skills/SkillDiff')
  const live = record()
  const edit = record({
    version: '1.0.1',
    files: [
      {
        path: 'SKILL.md',
        kind: 'instructions',
        content: SKILL_MD.replace('first', 'second'),
      },
      live.files[1],
    ],
  })
  const markup = await render(() => createElement(SkillDiff, { live, edit }))
  assert.match(markup, /Changed/)
  assert.match(markup, /1 line added/)
  assert.match(markup, /Removed: /)
  assert.match(markup, /Show 1 unchanged file too/)
})
