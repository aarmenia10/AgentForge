import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type { DocumentSnapshot, Firestore } from 'firebase/firestore'
import {
  castVote,
  postComment,
  deleteComment,
  submitReport,
} from '../src/services/ratings'
import { markExportChange } from '../src/services/firestore'
import { createSkillStore } from '../src/services/skillStore'
import { SEED_AGENTS } from '../src/data/seedAgents'
import { skill } from './skillFixture'

/*
 * Rules and service tests for thumbs, comments, and reports (P3-13).
 * R-01 to R-31 are the rows of docs/RATINGS.md section 10.1, one test each.
 * Tests named after a required fix (F1 to F9 in the PR) follow them.
 */

const PROJECT = 'demo-agentlemon'
const OLD = '2026-01-01T00:00:00.000Z'
const AGENT = 'public-agent'
const FRIENDS = 'friends-agent'
const PRIVATE = 'private-agent'
const PENDING = 'pending-agent'
const SKILL = 'test-skill'

function agentRecord(
  id: string,
  visibility: 'public' | 'friends' | 'private',
  review: 'approved' | 'pending',
) {
  return {
    ...SEED_AGENTS[0],
    id,
    author: { uid: 'alice', name: 'Alice', handle: 'alice', verified: false },
    owner_uid: 'alice',
    visibility,
    review_status: review,
    shared_with: [],
    stats: { stars: 5, views: 10, updated_at: OLD },
  }
}

function skillRecord(
  id: string,
  visibility: 'public' | 'friends' | 'private',
  review: 'approved' | 'pending',
  counts = { thumbs_up: 2, thumbs_down: 1 },
) {
  return {
    ...skill({
      id,
      name: id,
      visibility,
      author: { uid: 'alice', name: 'Alice', handle: 'alice', verified: false },
      stats: { updated_at: OLD, ...counts },
    }),
    owner_uid: 'alice',
    review_status: review,
  }
}

async function seed(env: RulesTestEnvironment) {
  await env.withSecurityRulesDisabled(async (context) => {
    const fs = context.firestore()
    await setDoc(doc(fs, 'admins/admin'), {})
    for (const uid of ['alice', 'bob', 'carol', 'dave', 'admin'])
      await setDoc(doc(fs, 'users', uid), {
        handle: uid,
        display_name: uid,
        avatar_url: null,
        created_at: OLD,
      })
    // Bob is Alice's friend. Carol and Dave are strangers.
    for (const [owner, other] of [
      ['alice', 'bob'],
      ['bob', 'alice'],
    ])
      await setDoc(doc(fs, `users/${owner}/relationships/${other}`), {
        sender_uid: 'alice',
        status: 'accepted',
        created_at: OLD,
      })
    await setDoc(
      doc(fs, 'agents', AGENT),
      agentRecord(AGENT, 'public', 'approved'),
    )
    await setDoc(
      doc(fs, 'agents', FRIENDS),
      agentRecord(FRIENDS, 'friends', 'pending'),
    )
    await setDoc(
      doc(fs, 'agents', PRIVATE),
      agentRecord(PRIVATE, 'private', 'pending'),
    )
    await setDoc(
      doc(fs, 'agents', PENDING),
      agentRecord(PENDING, 'public', 'pending'),
    )
    await setDoc(
      doc(fs, 'skills', SKILL),
      skillRecord(SKILL, 'public', 'approved'),
    )
    await setDoc(
      doc(fs, 'skills', 'private-skill'),
      skillRecord('private-skill', 'private', 'pending', {
        thumbs_up: 3,
        thumbs_down: 0,
      }),
    )
    // One comment on each agent, written with the rules out of the way.
    for (const id of [AGENT, FRIENDS, PRIVATE])
      await setDoc(doc(fs, 'agents', id, 'comments', 'c1'), {
        author_uid: 'bob',
        author_handle: 'bob',
        body: 'Seeded comment',
        created_at: new Date(OLD),
        deleted: false,
      })
  })
}

interface Scenario {
  env: RulesTestEnvironment
  anon: Firestore
  as(uid: string, verified?: boolean): Firestore
  peek(path: string): Promise<DocumentSnapshot>
}

async function scenario(run: (t: Scenario) => Promise<void>) {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })
  try {
    await env.clearFirestore()
    await seed(env)
    await run({
      env,
      anon: env.unauthenticatedContext().firestore() as unknown as Firestore,
      as: (uid, verified = true) =>
        env
          .authenticatedContext(uid, { email_verified: verified })
          .firestore() as unknown as Firestore,
      peek: async (path) => {
        // withSecurityRulesDisabled resolves to nothing, so carry the value out.
        let snapshot: DocumentSnapshot | undefined
        await env.withSecurityRulesDisabled(async (context) => {
          snapshot = await getDoc(
            doc(context.firestore() as unknown as Firestore, path),
          )
        })
        return snapshot!
      },
    })
  } finally {
    await env.cleanup()
  }
}

const revision = () => ({ revision: crypto.randomUUID() })

/** A comment written by hand, with its export marker, to exercise the rules alone. */
function rawComment(
  db: Firestore,
  uid: string,
  fields: Record<string, unknown>,
  options: { kind?: 'agents' | 'skills'; item?: string; marked?: boolean } = {},
) {
  const kind = options.kind ?? 'agents'
  const item = options.item ?? AGENT
  const batch = writeBatch(db)
  batch.set(doc(collection(db, kind, item, 'comments')), {
    author_uid: uid,
    author_handle: uid,
    body: 'A fair comment',
    created_at: serverTimestamp(),
    deleted: false,
    ...fields,
  })
  if (options.marked !== false)
    batch.set(
      doc(db, `export_sources/comments/changes/${kind}_${item}`),
      revision(),
    )
  return batch.commit()
}

/** A vote written by hand: vote document, matching counter change, optional marker. */
function rawVote(
  db: Firestore,
  uid: string,
  fields: Record<string, unknown>,
  options: { delta?: number; marked?: boolean; item?: string } = {},
) {
  const item = options.item ?? AGENT
  const batch = writeBatch(db)
  batch.set(doc(db, 'agents', item, 'votes', uid), {
    value: 'up',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    ...fields,
  })
  batch.update(doc(db, 'agents', item), {
    'stats.stars': increment(options.delta ?? 1),
  })
  if (options.marked !== false)
    batch.set(
      doc(db, `export_sources/votes/changes/agents_${item}`),
      revision(),
    )
  return batch.commit()
}

/* ---------- Votes: R-01 to R-09 ---------- */

test('R-01: a signed-out user cannot write a vote', async () =>
  scenario(async ({ anon }) => {
    await assertFails(castVote(anon, 'agent', AGENT, 'bob', 'up'))
  }))

test('R-02: a signed-in user votes up on a public approved agent and the counter moves by one', async () =>
  scenario(async ({ as, peek }) => {
    const result = await assertSucceeds(
      castVote(as('bob'), 'agent', AGENT, 'bob', 'up'),
    )
    assert.equal(result.thumbs_up, 6)
    assert.equal(result.userVote, 'up')
    assert.equal((await peek(`agents/${AGENT}`)).get('stats.stars'), 6)
    assert.equal((await peek(`agents/${AGENT}/votes/bob`)).get('value'), 'up')
  }))

test('R-03: changing a vote from up to down moves both sides', async () =>
  scenario(async ({ as, peek }) => {
    const bob = as('bob')
    await castVote(bob, 'agent', AGENT, 'bob', 'up')
    const result = await assertSucceeds(
      castVote(bob, 'agent', AGENT, 'bob', 'down'),
    )
    // Agents keep only thumbs up in stats.stars; down votes are counted from
    // the vote documents by the exporter.
    assert.equal(result.userVote, 'down')
    assert.equal((await peek(`agents/${AGENT}`)).get('stats.stars'), 5)
    assert.equal((await peek(`agents/${AGENT}/votes/bob`)).get('value'), 'down')
  }))

test('R-04: retracting a vote lowers the counter and removes the vote', async () =>
  scenario(async ({ as, peek }) => {
    const bob = as('bob')
    await castVote(bob, 'agent', AGENT, 'bob', 'up')
    const result = await assertSucceeds(
      castVote(bob, 'agent', AGENT, 'bob', 'up'),
    )
    assert.equal(result.userVote, null)
    assert.equal((await peek(`agents/${AGENT}`)).get('stats.stars'), 5)
    assert.equal((await peek(`agents/${AGENT}/votes/bob`)).exists(), false)
  }))

test("R-05: a user cannot vote on another user's private agent", async () =>
  scenario(async ({ as }) => {
    await assertFails(castVote(as('bob'), 'agent', PRIVATE, 'bob', 'up'))
  }))

test("R-06: a friend can vote on a friend's friends-visibility agent", async () =>
  scenario(async ({ as }) => {
    await assertSucceeds(castVote(as('bob'), 'agent', FRIENDS, 'bob', 'up'))
    await assertFails(castVote(as('carol'), 'agent', FRIENDS, 'carol', 'up'))
  }))

test('R-07: a user cannot vote on a pending public agent', async () =>
  scenario(async ({ as }) => {
    await assertFails(castVote(as('bob'), 'agent', PENDING, 'bob', 'up'))
  }))

test('R-08: a vote without updated_at is denied', async () =>
  scenario(async ({ as }) => {
    const bob = as('bob')
    const batch = writeBatch(bob)
    batch.set(doc(bob, 'agents', AGENT, 'votes', 'bob'), {
      value: 'up',
      created_at: serverTimestamp(),
    })
    batch.update(doc(bob, 'agents', AGENT), { 'stats.stars': increment(1) })
    markExportChange(batch, bob, 'votes', `agents_${AGENT}`)
    await assertFails(batch.commit())
    // The same write with the field is the control.
    await assertSucceeds(rawVote(as('bob'), 'bob', {}))
  }))

test('R-09: a vote with an invalid value is denied', async () =>
  scenario(async ({ as }) => {
    await assertFails(rawVote(as('bob'), 'bob', { value: 'sideways' }))
    await assertFails(rawVote(as('bob'), 'bob', { value: 'up', extra: 1 }))
  }))

/* ---------- Comments: R-10 to R-20 ---------- */

test('R-10: a signed-in user posts a valid comment on a public approved agent', async () =>
  scenario(async ({ as, peek }) => {
    const comment = await assertSucceeds(
      postComment(as('bob'), 'agent', AGENT, 'This is a great agent!', {
        uid: 'bob',
        handle: 'bob',
      }),
    )
    assert.equal(comment.author_handle, 'bob')
    assert.equal(
      (await peek(`agents/${AGENT}/comments/${comment.id}`)).get('body'),
      'This is a great agent!',
    )
  }))

test('R-11: a signed-out user cannot comment', async () =>
  scenario(async ({ anon }) => {
    await assertFails(rawComment(anon, 'bob', {}))
  }))

test('R-12: a user with an unverified email cannot comment', async () =>
  scenario(async ({ as }) => {
    await assertFails(rawComment(as('bob', false), 'bob', {}))
    await assertSucceeds(rawComment(as('bob'), 'bob', {}))
  }))

test('R-13: an empty comment is denied', async () =>
  scenario(async ({ as }) => {
    await assertFails(rawComment(as('bob'), 'bob', { body: '' }))
  }))

test('R-14: a comment of 1,001 characters is denied, 1,000 is allowed', async () =>
  scenario(async ({ as }) => {
    await assertFails(rawComment(as('bob'), 'bob', { body: 'a'.repeat(1001) }))
    await assertSucceeds(
      rawComment(as('bob'), 'bob', { body: 'a'.repeat(1000) }),
    )
  }))

test('R-15: a comment with a hard-core blocked word is denied, whole words only, any case', async () =>
  scenario(async ({ as }) => {
    for (const body of [
      'You absolute retard today',
      'Here is a RETARD',
      'retards.',
    ])
      await assertFails(rawComment(as('bob'), 'bob', { body }))
  }))

test('R-16: a comment with only non-hard-core words, or a blocked word inside a longer word, is allowed', async () =>
  scenario(async ({ as }) => {
    for (const body of [
      'Useful for my pipeline',
      'This is bullshit but allowed by the rules',
      'A fire retardant coating from Scunthorpe',
    ])
      await assertSucceeds(rawComment(as('bob'), 'bob', { body }))
  }))

test('R-17: an author soft-deletes their own comment', async () =>
  scenario(async ({ as, peek }) => {
    const comment = await postComment(as('bob'), 'agent', AGENT, 'Mine', {
      uid: 'bob',
      handle: 'bob',
    })
    await assertSucceeds(deleteComment(as('bob'), 'agent', AGENT, comment.id))
    assert.equal(
      (await peek(`agents/${AGENT}/comments/${comment.id}`)).get('deleted'),
      true,
    )
  }))

test('R-18: an admin soft-deletes any comment', async () =>
  scenario(async ({ as, peek }) => {
    const comment = await postComment(as('carol'), 'agent', AGENT, 'Hello', {
      uid: 'carol',
      handle: 'carol',
    })
    await assertSucceeds(deleteComment(as('admin'), 'agent', AGENT, comment.id))
    assert.equal(
      (await peek(`agents/${AGENT}/comments/${comment.id}`)).get('deleted'),
      true,
    )
  }))

test('R-19: a user who is neither the author nor an admin cannot soft-delete a comment', async () =>
  scenario(async ({ as }) => {
    const comment = await postComment(as('dave'), 'agent', AGENT, 'Hello', {
      uid: 'dave',
      handle: 'dave',
    })
    await assertFails(deleteComment(as('bob'), 'agent', AGENT, comment.id))
    // Editing the text is denied for the author too.
    await assertFails(
      updateDoc(doc(as('dave'), 'agents', AGENT, 'comments', comment.id), {
        body: 'Edited',
      }),
    )
  }))

test('R-20: no client can hard-delete a comment', async () =>
  scenario(async ({ as }) => {
    const comment = await postComment(as('bob'), 'agent', AGENT, 'Mine', {
      uid: 'bob',
      handle: 'bob',
    })
    for (const uid of ['bob', 'admin'])
      await assertFails(
        deleteDoc(doc(as(uid), 'agents', AGENT, 'comments', comment.id)),
      )
  }))

/* ---------- Reports: R-21 to R-27 ---------- */

test('R-21: a signed-in user files a report with a valid reason', async () =>
  scenario(async ({ as, peek }) => {
    await assertSucceeds(
      submitReport(as('bob'), 'agent', AGENT, 'bob', {
        reason: 'misleading',
        note: 'Wrong description',
      }),
    )
    assert.equal(
      (await peek(`agents/${AGENT}/reports/bob`)).get('reason'),
      'misleading',
    )
  }))

test('R-22: the same user updates their report', async () =>
  scenario(async ({ as, peek }) => {
    const bob = as('bob')
    await submitReport(bob, 'agent', AGENT, 'bob', { reason: 'spam' })
    await assertSucceeds(
      submitReport(bob, 'agent', AGENT, 'bob', { reason: 'harmful' }),
    )
    assert.equal(
      (await peek(`agents/${AGENT}/reports/bob`)).get('reason'),
      'harmful',
    )
  }))

test('R-23: a signed-in user cannot read the report collection', async () =>
  scenario(async ({ as }) => {
    await submitReport(as('bob'), 'agent', AGENT, 'bob', { reason: 'spam' })
    await assertFails(
      getDocs(
        query(collection(as('carol'), 'agents', AGENT, 'reports'), limit(10)),
      ),
    )
  }))

test('R-24: an admin reads the report collection with a bounded query', async () =>
  scenario(async ({ as }) => {
    await submitReport(as('bob'), 'agent', AGENT, 'bob', { reason: 'spam' })
    const snapshot = await assertSucceeds(
      getDocs(
        query(collection(as('admin'), 'agents', AGENT, 'reports'), limit(10)),
      ),
    )
    assert.equal(snapshot.size, 1)
  }))

test('R-25: an admin cannot read the report collection without a limit', async () =>
  scenario(async ({ as }) => {
    await assertFails(
      getDocs(collection(as('admin'), 'agents', AGENT, 'reports')),
    )
  }))

test('R-26: a report with an invalid reason is denied', async () =>
  scenario(async ({ as }) => {
    const bob = as('bob')
    await assertFails(
      setDoc(doc(bob, 'agents', AGENT, 'reports', 'bob'), {
        reason: 'invalid_reason_here',
        note: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }),
    )
  }))

test('R-27: a report note over 500 characters is denied', async () =>
  scenario(async ({ as }) => {
    const bob = as('bob')
    const report = (note: string) =>
      setDoc(doc(bob, 'agents', AGENT, 'reports', 'bob'), {
        reason: 'spam',
        note,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })
    await assertFails(report('x'.repeat(501)))
    await assertSucceeds(report('x'.repeat(500)))
  }))

test('an admin can delete reports for agents and skills', async () =>
  scenario(async ({ as, peek }) => {
    await submitReport(as('bob'), 'agent', AGENT, 'bob', { reason: 'spam' })
    await submitReport(as('bob'), 'skill', SKILL, 'bob', { reason: 'spam' })

    await assertSucceeds(
      deleteDoc(doc(as('admin'), 'agents', AGENT, 'reports', 'bob')),
    )
    await assertSucceeds(
      deleteDoc(doc(as('admin'), 'skills', SKILL, 'reports', 'bob')),
    )
    assert.equal((await peek(`agents/${AGENT}/reports/bob`)).exists(), false)
    assert.equal((await peek(`skills/${SKILL}/reports/bob`)).exists(), false)
  }))

test('reporters, item owners, and other users cannot delete agent reports', async () =>
  scenario(async ({ as }) => {
    await submitReport(as('bob'), 'agent', AGENT, 'bob', { reason: 'spam' })

    for (const uid of ['bob', 'alice', 'carol'])
      await assertFails(
        deleteDoc(doc(as(uid), 'agents', AGENT, 'reports', 'bob')),
      )
  }))

test('reporters, item owners, and other users cannot delete skill reports', async () =>
  scenario(async ({ as }) => {
    await submitReport(as('bob'), 'skill', SKILL, 'bob', { reason: 'spam' })

    for (const uid of ['bob', 'alice', 'carol'])
      await assertFails(
        deleteDoc(doc(as(uid), 'skills', SKILL, 'reports', 'bob')),
      )
  }))

/* ---------- Skills and export markers: R-28 to R-31 ---------- */

test('R-28: a vote on a public approved skill is allowed and moves the skill counters', async () =>
  scenario(async ({ as, peek }) => {
    const bob = as('bob')
    const up = await assertSucceeds(castVote(bob, 'skill', SKILL, 'bob', 'up'))
    assert.deepEqual([up.thumbs_up, up.thumbs_down], [3, 1])
    const down = await castVote(bob, 'skill', SKILL, 'bob', 'down')
    assert.deepEqual([down.thumbs_up, down.thumbs_down], [2, 2])
    assert.equal((await peek(`skills/${SKILL}`)).get('stats.thumbs_down'), 2)
  }))

test('R-29: a comment on a public approved skill is allowed', async () =>
  scenario(async ({ as }) => {
    await assertSucceeds(
      postComment(as('bob'), 'skill', SKILL, 'Handy skill', {
        uid: 'bob',
        handle: 'bob',
      }),
    )
  }))

test('R-30: a vote on a public approved agent writes its export marker in the same commit', async () =>
  scenario(async ({ as, peek }) => {
    await castVote(as('bob'), 'agent', AGENT, 'bob', 'up')
    assert.ok(
      (await peek(`export_sources/votes/changes/agents_${AGENT}`)).exists(),
    )
    // Without the marker the same vote is refused.
    await assertFails(rawVote(as('carol'), 'carol', {}, { marked: false }))
  }))

test('R-31: a vote on a non-public agent needs no marker and writes none', async () =>
  scenario(async ({ as, peek }) => {
    await castVote(as('bob'), 'agent', FRIENDS, 'bob', 'up')
    assert.equal(
      (await peek(`export_sources/votes/changes/agents_${FRIENDS}`)).exists(),
      false,
    )
  }))

/* ---------- Required fixes ---------- */

test('F2: a user with an up vote cannot also create a star', async () =>
  scenario(async ({ as }) => {
    const bob = as('bob')
    await castVote(bob, 'agent', AGENT, 'bob', 'up')
    const star = (db: Firestore, uid: string) => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'agents', AGENT, 'stars', uid), {
        user_id: uid,
        created_at: serverTimestamp(),
      })
      batch.update(doc(db, 'agents', AGENT), { 'stats.stars': increment(1) })
      markExportChange(batch, db, 'agents', AGENT)
      return batch.commit()
    }
    await assertFails(star(bob, 'bob'))
    // A user with no vote cannot start a star either.
    await assertFails(star(as('carol'), 'carol'))
  }))

test('F2: a legacy star can still be removed, and voting converts it', async () =>
  scenario(async ({ as, env, peek }) => {
    await env.withSecurityRulesDisabled(async (context) => {
      for (const uid of ['dave', 'carol'])
        await setDoc(
          doc(
            context.firestore() as unknown as Firestore,
            'agents',
            AGENT,
            'stars',
            uid,
          ),
          { user_id: uid, created_at: new Date(OLD) },
        )
    })
    const dave = as('dave')
    const batch = writeBatch(dave)
    batch.delete(doc(dave, 'agents', AGENT, 'stars', 'dave'))
    batch.update(doc(dave, 'agents', AGENT), { 'stats.stars': increment(-1) })
    markExportChange(batch, dave, 'agents', AGENT)
    await assertSucceeds(batch.commit())
    assert.equal((await peek(`agents/${AGENT}`)).get('stats.stars'), 4)
    // Voting down with a legacy star removes the star and the up it counted.
    const result = await assertSucceeds(
      castVote(as('carol'), 'agent', AGENT, 'carol', 'down'),
    )
    assert.equal(result.userVote, 'down')
    assert.equal((await peek(`agents/${AGENT}/stars/carol`)).exists(), false)
    assert.equal((await peek(`agents/${AGENT}`)).get('stats.stars'), 3)
  }))

test('F3: an owner edit cannot change a skill thumbs count', async () =>
  scenario(async ({ as, peek }) => {
    const alice = as('alice')
    const retire = (counts: Record<string, number>) => {
      const batch = writeBatch(alice)
      batch.update(doc(alice, 'skills', SKILL), {
        visibility: 'private',
        review_status: 'pending',
        ...counts,
      })
      markExportChange(batch, alice, 'skills', SKILL)
      return batch.commit()
    }
    await assertFails(retire({ 'stats.thumbs_up': 999 }))
    await assertFails(retire({ 'stats.thumbs_down': 0 }))
    // Never-approved skills are protected as well.
    await assertFails(
      updateDoc(doc(alice, 'skills', 'private-skill'), {
        'stats.thumbs_up': 50,
      }),
    )
    // The same edits without a count change are the control.
    await assertSucceeds(
      updateDoc(doc(alice, 'skills', 'private-skill'), {
        description: 'A clearer description',
      }),
    )
    await assertSucceeds(retire({}))
    const live = await peek(`skills/${SKILL}`)
    assert.deepEqual(
      [live.get('stats.thumbs_up'), live.get('stats.thumbs_down')],
      [2, 1],
    )
  }))

test('F3: a skill edit and its approval keep the live counts', async () =>
  scenario(async ({ as, peek }) => {
    const alice = as('alice')
    const live = (await peek(`skills/${SKILL}`)).data()!
    const edit = (counts: { thumbs_up: number; thumbs_down: number }) => ({
      ...live,
      version: '1.1.0',
      review_status: 'pending',
      stats: { updated_at: '2026-02-01T00:00:00.000Z', ...counts },
    })
    await assertFails(
      setDoc(
        doc(alice, 'skill_edits', SKILL),
        edit({ thumbs_up: 500, thumbs_down: 1 }),
      ),
    )
    await assertSucceeds(
      setDoc(
        doc(alice, 'skill_edits', SKILL),
        edit({ thumbs_up: 2, thumbs_down: 1 }),
      ),
    )
    const admin = as('admin')
    const approve = (counts: { thumbs_up: number; thumbs_down: number }) => {
      const approved = {
        ...edit(counts),
        review_status: 'approved',
      }
      const batch = writeBatch(admin)
      batch.set(doc(admin, 'skills', SKILL), approved)
      batch.set(doc(admin, 'skill_versions', `${SKILL}@1.1.0`), approved)
      batch.delete(doc(admin, 'skill_edits', SKILL))
      markExportChange(batch, admin, 'skills', SKILL)
      markExportChange(batch, admin, 'skill_versions', `${SKILL}@1.1.0`)
      return batch.commit()
    }
    await assertFails(approve({ thumbs_up: 500, thumbs_down: 1 }))
    await assertSucceeds(approve({ thumbs_up: 2, thumbs_down: 1 }))
    assert.equal((await peek(`skills/${SKILL}`)).get('version'), '1.1.0')
  }))

test('F3: approving a staged skill edit keeps votes cast since the edit was written', async () =>
  scenario(async ({ as, env, peek }) => {
    const owner = createSkillStore(as('alice'), 'alice')
    const reviewer = createSkillStore(as('admin'), 'admin')
    const id = 'pdf-forms'
    await owner.createSkill(skill({ visibility: 'public' }))
    await reviewer.reviewSkill(id, 'approved')
    await castVote(as('bob'), 'skill', id, 'bob', 'up')
    // The edit is written with the counts of that moment.
    const { staged } = await owner.updateSkill(
      skill({ visibility: 'public', version: '1.1.0' }),
    )
    assert.equal(staged, true)
    assert.equal((await peek(`skill_edits/${id}`)).get('stats.thumbs_up'), 1)
    // More votes arrive before the reviewer gets to it.
    await castVote(as('carol'), 'skill', id, 'carol', 'up')
    await castVote(as('dave'), 'skill', id, 'dave', 'down')
    await reviewer.reviewSkillEdit(id, 'approved')
    const after = await peek(`skills/${id}`)
    assert.equal(after.get('version'), '1.1.0')
    assert.deepEqual(
      [after.get('stats.thumbs_up'), after.get('stats.thumbs_down')],
      [2, 1],
    )
    void env
  }))

test('F4: an export marker needs a changed vote of the caller and a public approved parent', async () =>
  scenario(async ({ as }) => {
    const bob = as('bob')
    const put = (db: Firestore, path: string) =>
      setDoc(doc(db, `export_sources/${path}`), revision())
    // No vote changes in this commit.
    await assertFails(put(bob, `votes/changes/agents_${AGENT}`))
    await assertFails(put(bob, `votes/changes/skills_${SKILL}`))
    // The marker may only follow the caller's own vote, never another user's.
    const other = writeBatch(bob)
    other.set(doc(bob, 'agents', AGENT, 'votes', 'carol'), {
      value: 'up',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    other.set(
      doc(bob, `export_sources/votes/changes/agents_${AGENT}`),
      revision(),
    )
    await assertFails(other.commit())
    // A private or friends parent never gets a vote marker, even with a vote.
    const friends = writeBatch(bob)
    friends.set(doc(bob, 'agents', FRIENDS, 'votes', 'bob'), {
      value: 'up',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
    friends.update(doc(bob, 'agents', FRIENDS), { 'stats.stars': increment(1) })
    friends.set(
      doc(bob, `export_sources/votes/changes/agents_${FRIENDS}`),
      revision(),
    )
    await assertFails(friends.commit())
    // Ids must name an agent or a skill that exists.
    for (const id of [
      'agents_missing-agent',
      'skills_missing',
      'anything',
      `skills_${AGENT}`,
    ])
      await assertFails(put(bob, `votes/changes/${id}`))
    // The honest vote, with its marker, is the control.
    await assertSucceeds(rawVote(bob, 'bob', {}))
    // A retraction changes the caller's vote too.
    const retract = writeBatch(bob)
    retract.delete(doc(bob, 'agents', AGENT, 'votes', 'bob'))
    retract.update(doc(bob, 'agents', AGENT), { 'stats.stars': increment(-1) })
    retract.set(
      doc(bob, `export_sources/votes/changes/agents_${AGENT}`),
      revision(),
    )
    await assertSucceeds(retract.commit())
  }))

test('F4: a comment marker needs a public approved parent', async () =>
  scenario(async ({ as, anon }) => {
    const bob = as('bob')
    const put = (id: string) =>
      setDoc(doc(bob, `export_sources/comments/changes/${id}`), revision())
    await assertFails(put(`agents_${PRIVATE}`))
    await assertFails(put(`agents_${FRIENDS}`))
    await assertFails(put(`agents_${PENDING}`))
    await assertFails(put('agents_missing-agent'))
    await assertFails(put('nonsense'))
    await assertFails(put(`skills_${AGENT}`))
    await assertSucceeds(put(`agents_${AGENT}`))
    await assertSucceeds(put(`skills_${SKILL}`))
    // The signed-out cannot write markers.
    await assertFails(
      setDoc(
        doc(anon, `export_sources/comments/changes/agents_${AGENT}`),
        revision(),
      ),
    )
  }))

test('F5: comments are readable only where the item is readable', async () =>
  scenario(async ({ as, anon }) => {
    const list = (db: Firestore, id: string) =>
      getDocs(query(collection(db, 'agents', id, 'comments'), limit(10)))
    const one = (db: Firestore, id: string) =>
      getDoc(doc(db, 'agents', id, 'comments', 'c1'))
    // Friends-only: the owner and a friend read, a stranger and the signed-out do not.
    for (const uid of ['alice', 'bob']) {
      await assertSucceeds(list(as(uid), FRIENDS))
      await assertSucceeds(one(as(uid), FRIENDS))
    }
    for (const db of [as('carol'), anon]) {
      await assertFails(list(db, FRIENDS))
      await assertFails(one(db, FRIENDS))
    }
    // Private: the owner only (bob is a friend, but the agent is private).
    await assertSucceeds(list(as('alice'), PRIVATE))
    for (const db of [as('bob'), as('carol'), anon]) {
      await assertFails(list(db, PRIVATE))
      await assertFails(one(db, PRIVATE))
    }
    // Public and approved: everyone, as before, but with a limit.
    for (const db of [as('carol'), anon]) {
      await assertSucceeds(list(db, AGENT))
      await assertSucceeds(one(db, AGENT))
    }
    await assertFails(
      getDocs(collection(as('carol'), 'agents', AGENT, 'comments')),
    )
    // Skills follow the same rule.
    await assertSucceeds(
      getDocs(query(collection(anon, 'skills', SKILL, 'comments'), limit(10))),
    )
    await assertFails(
      getDocs(
        query(
          collection(anon, 'skills', 'private-skill', 'comments'),
          limit(10),
        ),
      ),
    )
  }))

test('F6: a comment needs a profile and must carry its exact username', async () =>
  scenario(async ({ as }) => {
    // Erin has an account but never chose a username.
    await assertFails(rawComment(as('erin'), 'erin', { author_handle: 'erin' }))
    await assertFails(rawComment(as('erin'), 'erin', { author_handle: 'bob' }))
    // Bob has a profile with the handle "bob".
    await assertFails(rawComment(as('bob'), 'bob', { author_handle: 'carol' }))
    await assertFails(rawComment(as('bob'), 'bob', { author_handle: 'BOB' }))
    await assertSucceeds(rawComment(as('bob'), 'bob', { author_handle: 'bob' }))
    // The author_uid must be the caller's.
    await assertFails(
      rawComment(as('bob'), 'carol', { author_handle: 'carol' }),
    )
  }))

test('stats-only owner saves still work now that votes share the stats-only branch', async () =>
  scenario(async ({ as }) => {
    const alice = as('alice')
    // An owner saving unchanged content only moves stats.updated_at.
    await assertSucceeds(
      updateDoc(doc(alice, 'agents', PRIVATE), {
        'stats.updated_at': '2026-02-01T00:00:00.000Z',
      }),
    )
    // Counters are still protected from the owner.
    await assertFails(
      updateDoc(doc(alice, 'agents', PRIVATE), { 'stats.stars': 99 }),
    )
    await assertFails(
      updateDoc(doc(alice, 'agents', PRIVATE), {
        'stats.stars': 99,
        'stats.updated_at': '2026-02-02T00:00:00.000Z',
      }),
    )
  }))
