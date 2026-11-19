import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import {
  castVote,
  postComment,
  deleteComment,
  submitReport,
  listReports,
} from '../src/services/ratings'
import { SEED_AGENTS } from '../src/data/seedAgents'

test('ratings and comments security rules and transactions (R-01 through R-31)', async () => {
  const projectId = 'demo-agentlemon'
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile('firestore.rules', 'utf8') },
  })

  try {
    await env.clearFirestore()

    const agentId = 'test-agent'
    const skillId = 'test-skill'

    // Seed agent, skill, and admin documents with rules disabled
    await env.withSecurityRulesDisabled(async (context) => {
      const fs = context.firestore()
      await setDoc(doc(fs, 'admins/admin'), {})
      await setDoc(doc(fs, 'users/alice'), { handle: 'alice' })
      await setDoc(doc(fs, 'users/bob'), { handle: 'bob' })
      await setDoc(doc(fs, 'users/carol'), { handle: 'carol' })
      await setDoc(doc(fs, 'users/dave'), { handle: 'dave' })
      await setDoc(doc(fs, 'users/admin'), { handle: 'admin' })

      // Public approved agent owned by alice
      await setDoc(doc(fs, 'agents', agentId), {
        ...SEED_AGENTS[0],
        id: agentId,
        author: {
          uid: 'alice',
          name: 'Alice',
          handle: 'alice',
          verified: true,
        },
        owner_uid: 'alice',
        visibility: 'public',
        review_status: 'approved',
        stats: { stars: 5, views: 10, updated_at: '2026-01-01T00:00:00Z' },
      })

      // Public approved skill owned by alice
      await setDoc(doc(fs, 'skills', skillId), {
        skill_schema_version: 1,
        id: skillId,
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
        author: {
          uid: 'alice',
          name: 'Alice',
          handle: 'alice',
          verified: true,
        },
        owner_uid: 'alice',
        visibility: 'public',
        review_status: 'approved',
        tags: ['test'],
        files: [
          {
            path: 'SKILL.md',
            kind: 'instructions',
            content:
              '---\nname: test-skill\ndescription: A test skill\n---\nBody',
          },
        ],
        stats: {
          thumbs_up: 2,
          thumbs_down: 1,
          updated_at: '2026-01-01T00:00:00Z',
        },
      })
    })

    const anon = env.unauthenticatedContext().firestore()
    const alice = env
      .authenticatedContext('alice', { email_verified: true })
      .firestore()
    const bob = env
      .authenticatedContext('bob', { email_verified: true })
      .firestore()
    const carol = env
      .authenticatedContext('carol', { email_verified: true })
      .firestore()
    const dave = env
      .authenticatedContext('dave', { email_verified: true })
      .firestore()
    const admin = env
      .authenticatedContext('admin', { email_verified: true })
      .firestore()

    /* ---------- R-01: unauthenticated cannot write votes ---------- */
    await assertFails(castVote(anon, 'agent', agentId, 'bob', 'up'))

    /* ---------- R-07: cannot vote for another user ---------- */
    await assertFails(castVote(bob, 'agent', agentId, 'carol', 'up'))

    /* ---------- R-02: Bob upvotes agent-1 (+1 stars, change marker) ---------- */
    const resBobUp = await assertSucceeds(
      castVote(bob, 'agent', agentId, 'bob', 'up'),
    )
    assert.equal(resBobUp.thumbs_up, 6)
    assert.equal(resBobUp.userVote, 'up')

    const agentSnap1 = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId)),
    )
    assert.equal(agentSnap1.get('stats.stars'), 6)
    const markerSnap1 = await withAdmin(env, (fs) =>
      getDoc(
        doc(fs, 'export_sources', 'votes', 'changes', `agents_${agentId}`),
      ),
    )
    assert.ok(markerSnap1.exists(), 'export change marker was written')

    /* ---------- R-03: Carol downvotes agent-1 (0 stars delta, change marker) ---------- */
    const resCarolDown = await assertSucceeds(
      castVote(carol, 'agent', agentId, 'carol', 'down'),
    )
    assert.equal(resCarolDown.thumbs_up, 6)
    assert.equal(resCarolDown.userVote, 'down')
    const agentSnap2 = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId)),
    )
    assert.equal(agentSnap2.get('stats.stars'), 6) // Stars unchanged for downvote on agents

    /* ---------- R-04: Bob retracts upvote (-1 stars delta) ---------- */
    const resBobRetract = await assertSucceeds(
      castVote(bob, 'agent', agentId, 'bob', 'up'),
    )
    assert.equal(resBobRetract.thumbs_up, 5)
    assert.equal(resBobRetract.userVote, null)
    const agentSnap3 = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId)),
    )
    assert.equal(agentSnap3.get('stats.stars'), 5)

    /* ---------- R-05: Carol switches downvote to upvote (+1 stars delta) ---------- */
    const resCarolUp = await assertSucceeds(
      castVote(carol, 'agent', agentId, 'carol', 'up'),
    )
    assert.equal(resCarolUp.thumbs_up, 6)
    assert.equal(resCarolUp.userVote, 'up')
    const agentSnap4 = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId)),
    )
    assert.equal(agentSnap4.get('stats.stars'), 6)

    /* ---------- R-06: Carol switches upvote to downvote (-1 stars delta) ---------- */
    const resCarolSwitchDown = await assertSucceeds(
      castVote(carol, 'agent', agentId, 'carol', 'down'),
    )
    assert.equal(resCarolSwitchDown.thumbs_up, 5)
    assert.equal(resCarolSwitchDown.userVote, 'down')
    const agentSnap5 = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId)),
    )
    assert.equal(agentSnap5.get('stats.stars'), 5)

    /* ---------- R-08: delta mismatch rejected by rules ---------- */
    await assertFails(
      runTransaction(bob, async (tx) => {
        const itemRef = doc(bob, 'agents', agentId)
        const voteRef = doc(itemRef, 'votes', 'bob')
        tx.set(voteRef, {
          value: 'up',
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        })
        // Attempting to increment stars by 5 instead of 1
        tx.update(itemRef, { 'stats.stars': increment(5) })
      }),
    )

    /* ---------- R-09: Binding Change 2: Dave had old star document, voting deletes it atomically ---------- */
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'agents', agentId, 'stars', 'dave'), {
        created_at: '2026-01-01T00:00:00Z',
      })
      // Dave already accounted for in stars
      await updateDoc(doc(c.firestore(), 'agents', agentId), {
        'stats.stars': 6,
      })
    })

    // Dave downvotes: star doc is deleted, stats.stars decremented by 1
    const resDaveDown = await assertSucceeds(
      castVote(dave, 'agent', agentId, 'dave', 'down'),
    )
    assert.equal(resDaveDown.thumbs_up, 5)
    assert.equal(resDaveDown.userVote, 'down')

    const daveStarDoc = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId, 'stars', 'dave')),
    )
    assert.equal(
      daveStarDoc.exists(),
      false,
      'old star document was deleted atomically',
    )

    /* ---------- R-10, R-11, R-12, R-13: Skill voting rules ---------- */
    // Skill upvote by Bob
    const resSkillUp = await assertSucceeds(
      castVote(bob, 'skill', skillId, 'bob', 'up'),
    )
    assert.equal(resSkillUp.thumbs_up, 3)
    assert.equal(resSkillUp.thumbs_down, 1)

    // Skill downvote by Carol
    const resSkillDown = await assertSucceeds(
      castVote(carol, 'skill', skillId, 'carol', 'down'),
    )
    assert.equal(resSkillDown.thumbs_up, 3)
    assert.equal(resSkillDown.thumbs_down, 2)

    // Skill switch: Bob switches up to down (-1 up, +1 down)
    const resSkillSwitch = await assertSucceeds(
      castVote(bob, 'skill', skillId, 'bob', 'down'),
    )
    assert.equal(resSkillSwitch.thumbs_up, 2)
    assert.equal(resSkillSwitch.thumbs_down, 3)

    // Skill retraction: Carol retracts downvote (-1 down)
    const resSkillRetract = await assertSucceeds(
      castVote(carol, 'skill', skillId, 'carol', 'down'),
    )
    assert.equal(resSkillRetract.thumbs_up, 2)
    assert.equal(resSkillRetract.thumbs_down, 2)

    /* ---------- R-14: Unauthenticated cannot comment ---------- */
    await assertFails(
      postComment(anon, 'agent', agentId, 'Anonymous comment', {
        uid: 'anon',
        handle: 'anon',
      }),
    )

    /* ---------- R-15: Author cannot comment on own agent/skill ---------- */
    await assertFails(
      postComment(alice, 'agent', agentId, 'Self praise', {
        uid: 'alice',
        handle: 'alice',
      }),
    )
    await assertFails(
      postComment(alice, 'skill', skillId, 'Self praise', {
        uid: 'alice',
        handle: 'alice',
      }),
    )

    /* ---------- R-16: Valid comment accepted (<= 1000 chars, no blocked words) ---------- */
    const comment1 = await assertSucceeds(
      postComment(bob, 'agent', agentId, 'This is a great agent!', {
        uid: 'bob',
        handle: 'bob',
      }),
    )
    assert.ok(comment1.id)
    assert.equal(comment1.author_handle, 'bob')

    /* ---------- R-17: Comment over 1000 chars rejected in rules and client ---------- */
    await assert.rejects(
      postComment(bob, 'agent', agentId, 'a'.repeat(1001), {
        uid: 'bob',
        handle: 'bob',
      }),
      /between 1 and 1,000 characters/,
    )

    const tooLongBatch = writeBatch(bob)
    tooLongBatch.set(doc(bob, 'agents', agentId, 'comments', 'c-long'), {
      author_uid: 'bob',
      author_handle: 'bob',
      body: 'a'.repeat(1001),
      created_at: serverTimestamp(),
      deleted: false,
    })
    tooLongBatch.set(
      doc(bob, 'export_sources', 'comments', 'changes', `agents_${agentId}`),
      {
        revision: '44444444-4444-4444-4444-444444444444',
      },
    )
    await assertFails(tooLongBatch.commit())

    /* ---------- R-18: Comment with blocked word rejected in rules ---------- */
    // RE2 regex (?is).*\b(word1|badword|spamword|hateword|slurword|hardcoreword)\b.*
    const badBatch1 = writeBatch(bob)
    badBatch1.set(doc(bob, 'agents', agentId, 'comments', 'c-bad1'), {
      author_uid: 'bob',
      author_handle: 'bob',
      body: 'Check out this word1 today',
      created_at: serverTimestamp(),
      deleted: false,
    })
    badBatch1.set(
      doc(bob, 'export_sources', 'comments', 'changes', `agents_${agentId}`),
      {
        revision: '11111111-1111-1111-1111-111111111111',
      },
    )
    await assertFails(badBatch1.commit())

    const badBatch2 = writeBatch(bob)
    badBatch2.set(doc(bob, 'agents', agentId, 'comments', 'c-bad2'), {
      author_uid: 'bob',
      author_handle: 'bob',
      body: 'Here is a badword',
      created_at: serverTimestamp(),
      deleted: false,
    })
    badBatch2.set(
      doc(bob, 'export_sources', 'comments', 'changes', `agents_${agentId}`),
      {
        revision: '22222222-2222-2222-2222-222222222222',
      },
    )
    await assertFails(badBatch2.commit())

    /* ---------- R-19: Whole-word boundary in rules accepts innocent words containing blocked words ---------- */
    // Innocent words: "password1", "sword1", "word1ing" contain "word1", but are accepted!
    const goodBatch = writeBatch(bob)
    goodBatch.set(doc(bob, 'agents', agentId, 'comments', 'c-good1'), {
      author_uid: 'bob',
      author_handle: 'bob',
      body: 'My password1 is safe and my sword1 is sharp',
      created_at: serverTimestamp(),
      deleted: false,
    })
    goodBatch.set(
      doc(bob, 'export_sources', 'comments', 'changes', `agents_${agentId}`),
      {
        revision: '33333333-3333-3333-3333-333333333333',
      },
    )
    await assertSucceeds(goodBatch.commit())

    /* ---------- R-20: Author can soft-delete own comment ---------- */
    await assertSucceeds(deleteComment(bob, 'agent', agentId, comment1.id))
    const deletedSnap = await withAdmin(env, (fs) =>
      getDoc(doc(fs, 'agents', agentId, 'comments', comment1.id)),
    )
    assert.equal(deletedSnap.get('deleted'), true)

    /* ---------- R-21: Admin can soft-delete any comment ---------- */
    const commentCarol = await assertSucceeds(
      postComment(carol, 'agent', agentId, 'Carol says hello', {
        uid: 'carol',
        handle: 'carol',
      }),
    )
    await assertSucceeds(
      deleteComment(admin, 'agent', agentId, commentCarol.id),
    )

    /* ---------- R-22: Non-author non-admin cannot delete comment ---------- */
    const commentDave = await assertSucceeds(
      postComment(dave, 'agent', agentId, 'Dave says hello', {
        uid: 'dave',
        handle: 'dave',
      }),
    )
    await assertFails(deleteComment(bob, 'agent', agentId, commentDave.id))

    /* ---------- R-23: Comments cannot be edited ---------- */
    await assertFails(
      updateDoc(doc(dave, 'agents', agentId, 'comments', commentDave.id), {
        body: 'Edited comment text',
      }),
    )

    /* ---------- R-24: Comment creates export change record ---------- */
    const commentMarker = await withAdmin(env, (fs) =>
      getDoc(
        doc(fs, 'export_sources', 'comments', 'changes', `agents_${agentId}`),
      ),
    )
    assert.ok(commentMarker.exists())

    /* ---------- R-25: Report submitted by signed-in user accepted ---------- */
    await assertSucceeds(
      submitReport(bob, 'agent', agentId, 'bob', {
        reason: 'misleading',
        note: 'Wrong description',
      }),
    )

    /* ---------- R-26: Report on own item rejected ---------- */
    await assertFails(
      submitReport(alice, 'agent', agentId, 'alice', {
        reason: 'spam',
        note: 'Self report',
      }),
    )

    /* ---------- R-27: Report with invalid reason rejected ---------- */
    await assertFails(
      setDoc(doc(bob, 'agents', agentId, 'reports', 'bob'), {
        reason: 'invalid_reason_here',
        note: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }),
    )

    /* ---------- R-28: Report note over 500 chars rejected ---------- */
    await assertFails(
      setDoc(doc(bob, 'agents', agentId, 'reports', 'bob'), {
        reason: 'spam',
        note: 'x'.repeat(501),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      }),
    )

    /* ---------- R-29: Report cannot be deleted by user ---------- */
    await assertFails(deleteDoc(doc(bob, 'agents', agentId, 'reports', 'bob')))

    /* ---------- R-30: Admin can read reports via collection group ---------- */
    const adminReports = await assertSucceeds(listReports(admin, 10))
    assert.ok(adminReports.length >= 1)

    /* ---------- R-31: Non-admin cannot read reports via collection group ---------- */
    await assertFails(getDocs(collectionGroup(bob, 'reports')))
  } finally {
    await env.cleanup()
  }
})
