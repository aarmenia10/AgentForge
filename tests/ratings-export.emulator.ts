import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Firestore, Timestamp, setLogFunction } from 'firebase-admin/firestore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { parsePublicSkillIndex } from '../src/lib/skillSchema'
import { castVote } from '../src/services/ratings'
import { COMMENTS_SHOWN } from '../scripts/ratingsExport'
import {
  exportDigest,
  seedRecord,
  writeSkillFiles,
} from '../scripts/export-catalog'
import { acknowledge } from '../scripts/catalogChanges'
import { readFirestoreExport } from '../scripts/catalogFirestore'
import { skill } from './skillFixture'

const PROJECT = 'demo-agentlemon'
const OLD = '2026-01-01T00:00:00.000Z'
const AGENT = 'rated-agent'
const SKILL = 'pdf-forms'

const agent = () => seedRecord({ ...SEED_AGENTS[0], id: AGENT })
const skillRecord = (counts?: { thumbs_up: number; thumbs_down: number }) => ({
  ...skill({
    author: { uid: 'u1', name: 'Ada', handle: 'ada', verified: false },
    stats: { updated_at: OLD, ...counts },
  }),
  owner_uid: 'u1',
  review_status: 'approved',
})

// Documents the Admin SDK actually returned (point reads and query results).
// An aggregation query returns none, which is how a count is told from a scan.
async function readDocuments<T>(run: () => Promise<T>) {
  const paths: string[] = []
  setLogFunction((message) => {
    const match = message.match(
      /\[Firestore\.requestStream\]: Received response: (.*)$/,
    )
    if (!match) return
    const name = JSON.parse(match[1]).document?.name
    if (typeof name === 'string') paths.push(name.split('/documents/')[1])
  })
  try {
    return { result: await run(), paths }
  } finally {
    setLogFunction(null)
  }
}

async function exporting(
  run: (t: {
    db: Firestore
    env: Awaited<ReturnType<typeof initializeTestEnvironment>>
  }) => Promise<void>,
) {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  const db = new Firestore({ projectId: PROJECT })
  try {
    await env.clearFirestore()
    await db.doc('agents/' + AGENT).set(agent())
    await db.doc(`agent_versions/${AGENT}@1.0.0`).set(agent())
    await run({ db, env })
  } finally {
    await db.terminate()
    await env.cleanup()
  }
}

const bob = (env: Awaited<ReturnType<typeof initializeTestEnvironment>>) =>
  env.authenticatedContext('bob', { email_verified: true }).firestore()

test('F1: a public approved skill with thumbs counts still exports, and the counts reach skills.json', async () =>
  exporting(async ({ db, env }) => {
    const directory = await mkdtemp(join(tmpdir(), 'ratings-skill-'))
    try {
      const counts = { thumbs_up: 3, thumbs_down: 1 }
      await db.doc('skills/' + SKILL).set(skillRecord(counts))
      await db.doc(`skill_versions/${SKILL}@1.0.0`).set(skillRecord(counts))
      const notices: string[] = []
      const full = await readFirestoreExport(db, [], [], (n) =>
        notices.push(n.id + ':' + n.reason),
      )
      assert.deepEqual(notices, [], 'the skill was not dropped as invalid')
      const [entry] = full.skillIndex.skills
      assert.equal(entry.id, SKILL)
      assert.equal(entry.stats.thumbs_up, 3)
      assert.equal(entry.stats.thumbs_down, 1)
      assert.deepEqual(
        [
          full.ratingsFiles.get(`ratings/skill/${SKILL}.json`)?.thumbs_up,
          full.ratingsFiles.get(`ratings/skill/${SKILL}.json`)?.thumbs_down,
        ],
        [3, 1],
      )
      // The file on disk parses with the reader released servers use.
      await writeSkillFiles(directory, full)
      const index = parsePublicSkillIndex(
        JSON.parse(await readFile(join(directory, 'skills.json'), 'utf8')),
      )
      assert.equal(index.skills.length, 1)
      assert.equal(index.skills[0].stats.thumbs_up, 3)
      // A vote after that reaches the next incremental export.
      await castVote(bob(env), 'skill', SKILL, 'bob', 'up')
      const next = await readFirestoreExport(db, [], [], () => {}, full)
      assert.equal(next.skillIndex.skills[0].stats.thumbs_up, 4)
      assert.equal(
        next.ratingsFiles.get(`ratings/skill/${SKILL}.json`)?.thumbs_up,
        4,
      )
      assert.equal(
        exportDigest(next),
        exportDigest(await readFirestoreExport(db, [], [], () => {})),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }))

test('a vote on an agent reaches catalog.json and the ratings file in the next incremental export, and adds no field to the agent', async () =>
  exporting(async ({ db, env }) => {
    const full = await readFirestoreExport(db, [], [], () => {})
    await acknowledge(db, full.receipts)
    const before = full.catalog.find((a) => a.id === AGENT)!
    await castVote(bob(env), 'agent', AGENT, 'bob', 'up')
    await castVote(
      env.authenticatedContext('carol').firestore(),
      'agent',
      AGENT,
      'carol',
      'down',
    )
    const next = await readFirestoreExport(db, [], [], () => {}, full)
    const entry = next.catalog.find((a) => a.id === AGENT)!
    assert.equal(entry.stats.stars, before.stats.stars + 1)
    const rating = next.ratingsFiles.get(`ratings/agent/${AGENT}.json`)!
    assert.equal(rating.thumbs_up, before.stats.stars + 1)
    assert.equal(rating.thumbs_down, 1)
    // Thumbs down and comments never enter agent entries or version files.
    const expected = Object.keys(SEED_AGENTS[0]).sort()
    assert.deepEqual(Object.keys(entry).sort(), expected)
    assert.deepEqual(Object.keys(entry.stats).sort(), [
      'stars',
      'updated_at',
      'views',
    ])
    const version = next.files.get(`${AGENT}/1.0.0.json`)!
    assert.deepEqual(Object.keys(version).sort(), expected)
    assert.deepEqual(Object.keys(version.stats).sort(), [
      'stars',
      'updated_at',
      'views',
    ])
    assert.equal(
      exportDigest(next),
      exportDigest(await readFirestoreExport(db, [], [], () => {})),
    )
  }))

test('F7: thumbs down are counted with an aggregation query, not by reading every vote', async () =>
  exporting(async ({ db }) => {
    const votes = db.collection(`agents/${AGENT}/votes`)
    for (const [uid, value] of [
      ['a', 'down'],
      ['b', 'down'],
      ['c', 'down'],
      ['d', 'up'],
      ['e', 'up'],
    ])
      await votes.doc(uid).set({
        value,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      })
    const { result, paths } = await readDocuments(() =>
      readFirestoreExport(db, [], [], () => {}),
    )
    assert.equal(
      result.ratingsFiles.get(`ratings/agent/${AGENT}.json`)?.thumbs_down,
      3,
    )
    assert.deepEqual(
      paths.filter((path) => path.includes('/votes/')),
      [],
      'no vote document was read',
    )
  }))

test('F9: the static file keeps the newest 50 comments, oldest first, and leaves out deleted and blocked ones', async () =>
  exporting(async ({ db }) => {
    const comments = db.collection(`agents/${AGENT}/comments`)
    const base = Date.parse(OLD)
    const total = 60
    for (let i = 1; i <= total; i++)
      await comments.doc(`c${String(i).padStart(2, '0')}`).set({
        author_uid: 'bob',
        author_handle: 'bob',
        body: `Comment number ${i}`,
        created_at: Timestamp.fromMillis(base + i * 60_000),
        // Comment 58 was deleted. Comment 59 has a blocked word. Both are among the newest.
        deleted: i === 58,
      })
    await comments.doc('c59').update({ body: 'This one is bullshit' })
    const log: string[] = []
    const result = await readFirestoreExport(db, [], [], (n) =>
      log.push(n.id + ':' + n.reason),
    )
    const shown = result.ratingsFiles
      .get(`ratings/agent/${AGENT}.json`)!
      .comments.map((comment) => comment.id)
    // The newest 50 non-deleted documents are c10..c60 without c58. The blocked
    // c59 is then dropped from the file, so 49 remain.
    const expected = Array.from({ length: 51 }, (_, i) => 10 + i)
      .filter((n) => n !== 58 && n !== 59)
      .map((n) => `c${String(n).padStart(2, '0')}`)
    assert.equal(COMMENTS_SHOWN, 50)
    assert.deepEqual(shown, expected)
    assert.ok(shown.includes('c60'), 'the newest comment is shown')
    assert.ok(!shown.includes('c09'), 'the oldest comments fall away')
    assert.deepEqual(log, ['c59:blocked-word comment'])
    for (const key of ['author_uid', 'deleted'])
      assert.ok(
        result.ratingsFiles
          .get(`ratings/agent/${AGENT}.json`)!
          .comments.every((comment) => !(key in comment)),
      )
  }))
