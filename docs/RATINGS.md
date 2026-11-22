<!-- `public/blocked-words.json` is a PLACEHOLDER list (word1, badword, and similar). It is
     not an approved list. The owner supplies the real one before comments go live; do not
     invent one. The first six entries are mirrored in `noBlockedWords` in `firestore.rules`,
     and a test keeps the two in step. -->

# P3-13 Ratings Design — Thumbs, Comments, Reports

> **Blocked-words list:** the owner approved the list in `public/blocked-words.json` on 2026-11-22. Its first entries (slurs) are also compiled into the `noBlockedWords` rule; the rest (strong profanity and sexual words) are checked in the browser and the exporter. A test keeps the rules list equal to the front of the file.
>
> **As built (2026-11-20 rework of PR #28).** Where this design and the code differ, the code and the README decision log win. The differences:
>
> - Agents keep thumbs up in `stats.stars`. Thumbs down and comments live only in `public/ratings/<kind>/<id>.json`. Agent entries in `catalog.json` and agent version files gain no field. Skills carry `stats.thumbs_up` and `stats.thumbs_down`, and `skills.json` may repeat them.
> - New stars are refused. A legacy star can still be deleted, and a vote converts it. Agent thumbs down are counted with an aggregation query (one billed read per 1,000 votes).
> - Export marker ids are `agents_<id>` and `skills_<id>`. A marker needs a public approved parent, and a vote marker needs the caller's own vote document to change in the same commit.
> - Comments are readable only where the item is readable (bounded lists), need a profile, and must carry the profile's exact username. The static file keeps the newest 50 non-deleted comments, oldest first. This needs the composite index on `comments` in `firestore.indexes.json`.
> - Owner edits and edit approvals keep a skill's live vote counts.

**Scope:** agents and skills. Councils reuse the same sub-collections when P3-14 lands; this document notes where.

**Non-negotiable decisions (owner, do not reopen):**

- Thumbs up / thumbs down replace stars. One vote per signed-in user per item, changeable.
- Existing stars become thumbs up.
- Comments are public. Admins delete any comment; authors delete their own.
- A comment that contains a word on the blocked-words list cannot be posted, enforced in the browser and again on the server side.
- Counts and comments reach the site through the hourly static export (an hour's delay is accepted).
- Public browsing costs zero Firestore reads (invariant 3 holds).
- Everything stays on the free plans (invariant 2 holds).

---

## 1. Firestore layout

### 1.1 Vote documents

```
agents/{agentId}/votes/{userId}
skills/{skillId}/votes/{userId}
```

One document per user per item. Document id is the voter's Firebase uid (same pattern as stars today).

```
{
  value:      "up" | "down",   // the vote
  created_at: Timestamp,       // server timestamp on create
  updated_at: Timestamp        // server timestamp on update (change)
}
```

**Rationale for sub-collection (not a top-level collection):** consistent with the existing `agents/{id}/stars/{uid}` pattern, so the security rules already know how to scope a vote to a readable parent. A sub-collection also makes the per-item vote count a simple `size()` or aggregate query and keeps the item document from carrying an unbounded list.

**Why `updated_at` on the document:** the exporter reads the parent document's aggregate counters (see §4), not individual vote documents. The timestamp is for admin forensics and future appeal flows, not export logic.

### 1.2 Comment documents

```
agents/{agentId}/comments/{commentId}
skills/{skillId}/comments/{commentId}
```

The document id is a push id (`auto-id`) written by the browser client via `addDoc`. The server-side Firestore rules validate the content; the exporter writes an array of comments per item into the static files.

```
{
  author_uid:  string,      // Firebase uid of the writer
  author_handle: string,    // snapshot of their handle at write time (display only)
  body:        string,      // 1–1 000 characters
  created_at:  Timestamp,   // server timestamp
  deleted:     false        // only admins/authors set this to true (never hard-delete)
}
```

**Why soft delete (`deleted: true`) instead of hard delete:** Firestore rules cannot prevent a client from reading a document it has already fetched. A soft delete means the exporter omits deleted comments from public files, so they never reach the site, and no document id is ever reused. Hard-deleting a comment would require the exporter to know the old document id to remove it from the last published file — either a full export or a tombstone mechanism.

**`author_handle` as a snapshot:** handles can change. The handle at write time is recorded so the display is stable. It is display-only; the uid is authoritative for deletion checks.

**Body limit — 1 000 characters:** matches the skill description limit, fits in one Firestore read, and is long enough for meaningful feedback.

### 1.3 Report documents

```
agents/{agentId}/reports/{userId}
skills/{skillId}/reports/{userId}
```

One report per user per item (over-reporting is wasteful; a second report from the same user is an update). Document id is the reporter's uid.

```
{
  reason:     "spam" | "harmful" | "misleading" | "other",
  note:       string,     // optional, at most 500 characters
  created_at: Timestamp,
  updated_at: Timestamp
}
```

Reports are **not exported** to public static files. They are read only by admins through a bounded Firestore query. The comment report (reporting a specific comment) is a future extension; this release covers item-level reports.

**Future council path:** `councils/{councilId}/votes/{userId}`, `/comments/{commentId}`, `/reports/{userId}` follow the same shapes. No extra design work is needed.

### 1.4 Aggregate counters on the parent document

The parent `agents/{id}` and `skills/{id}` documents carry aggregate counters that the exporter copies into static files. The existing `stats` map is extended:

```
stats: {
  thumbs_up:   number,   // replaces stats.stars
  thumbs_down: number,   // new
  updated_at:  string    // unchanged
  // stats.stars and stats.views are removed — see migration §9
}
```

The browser updates counters transactionally in the same commit as the vote document, mirroring the star transaction in `src/services/firestore.ts`. The exporter reads only the parent document's counters, not every vote sub-document, keeping export reads bounded.

**Counts in `catalog.json` and `skills.json`:** the exporter copies `thumbs_up` and `thumbs_down` from the parent document into the catalog entry. No new sub-collection reads are added to the export path.

---

## 2. Firestore rules

### 2.1 Votes

```
match /agents/{agentId}/votes/{userId} {
  allow get:    if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data);
  allow create: if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data)
                  && validVote(request.resource.data)
                  && validVoteDelta(agentId, 'agents');
  allow update: if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data)
                  && validVote(request.resource.data)
                  && resource.data.value != request.resource.data.value  // must change
                  && validVoteChangeDelta(agentId, 'agents');
  allow delete: if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data)
                  && validVoteDeleteDelta(agentId, 'agents');
}
```

Skill votes mirror this with `skillPath` and `readableSkill`. The helper functions:

```
function validVote(data) {
  return data.keys().hasOnly(['value', 'created_at', 'updated_at'])
    && data.value in ['up', 'down']
    && data.created_at == request.time
    && data.updated_at == request.time;
}

function validVoteDelta(itemId, collection) {
  // After create: thumbs_up increases by 1 when value == 'up',
  // thumbs_down increases by 1 when value == 'down'. Exactly one changes.
  let before = get(agentPath(itemId)).data;   // adapted per collection
  let after  = getAfter(agentPath(itemId)).data;
  let d = after.diff(before).affectedKeys();
  return d.hasOnly(['stats'])
    && after.stats.diff(before.stats).affectedKeys().hasOnly(
         request.resource.data.value == 'up' ? ['thumbs_up'] : ['thumbs_down'])
    && (after.stats.thumbs_up == before.stats.thumbs_up +
         (request.resource.data.value == 'up' ? 1 : 0))
    && (after.stats.thumbs_down == before.stats.thumbs_down +
         (request.resource.data.value == 'down' ? 1 : 0));
}
```

Update and delete deltas are analogous (undo old value, apply new one). The rules impose the same atomic-counter pattern used for stars and require the export marker to be set when the parent is public and approved.

**Export marker on vote write:** a vote on a public approved agent must write `export_sources/agents/changes/{agentId}` in the same batch (or the rules reject it, mirroring the star rule). This keeps the counter in `catalog.json` up to date after each hourly run.

### 2.2 Comments

```
match /agents/{agentId}/comments/{commentId} {
  allow list: if true;   // public — but only the exporter's output reaches browsers
  allow get:  if true;
  allow create: if signedIn() && verifiedEmail()
                  && readableAgent(get(agentPath(agentId)).data)
                  && validComment(request.resource.data)
                  && noBlockedWords(request.resource.data.body);
  allow update: if isAdmin()
                  && request.resource.data.diff(resource.data)
                      .affectedKeys().hasOnly(['deleted'])
                  && request.resource.data.deleted == true;
  allow delete: if false;  // soft-delete only
}
```

**Author self-delete:** the author sets `deleted: true` through an update:

```
  allow update: if (isAdmin()
                  || (signedIn() && request.auth.uid == resource.data.author_uid))
                  && request.resource.data.diff(resource.data)
                      .affectedKeys().hasOnly(['deleted'])
                  && request.resource.data.deleted == true;
```

**Why `allow list: if true` on comments:** the sub-collection itself is public. Individual comments will be fetched through the hourly export, not live Firestore reads, so the invariant-3 cost is zero. The rules allow the read in case an admin tool needs to query comments directly; the site never issues this query.

### 2.3 `noBlockedWords` in Firestore rules — the problem and the solution

Firestore Security Rules have two limitations that make a blocked-word check hard:

1. **No loops.** You cannot iterate over a list of words.
2. **No regex over externally sourced strings.** `matches()` takes a literal regex, not a runtime string from another document.

**What the rules can do:** check whether the comment body matches a single compiled regex literal. With a short, known-at-deploy-time word list, you write one `matches()` call with a pattern like `'(?i).*(badword1|badword2|badword3).*'`. Firestore rules compile the regex at deploy time, so it is fast and costs no extra read.

**Practical limit:** the rules file must stay under 256 KB. A regex joining 50–100 short words is about 1–2 KB. If the word list grows past a few hundred entries the regex becomes unmaintainable and the rules file bloats.

**Design decision — two-tier enforcement:**

| Tier     | Where    | Mechanism                                                   | Words covered                                                             |
| -------- | -------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| Browser  | Client   | JavaScript array check before `addDoc`                      | Full list from `blocked-words.json` (Hosting)                             |
| Rules    | Server   | Compiled regex in `firestore.rules`                         | A smaller "hard core" list (~50 words) that must never reach the database |
| Exporter | Pipeline | Full list re-check on every comment that reaches the export | Full list from source                                                     |

The rules cover only the hard-core list; the browser and exporter cover the full list. This is explicitly honest: a determined actor who bypasses the browser client can still post a word that is on the full list but not the hard-core list. That comment will be blocked at the exporter and never published. It stays in Firestore (soft-deleted by the exporter pipeline or by an admin) but never reaches the site.

**The exporter re-check:** during the hourly run, every comment fetched from Firestore is checked against the full word list before it is written to the static file. Comments that contain blocked words are skipped and logged (with the comment id, not the text, to avoid storing flagged content in CI logs). An admin is expected to see the log and soft-delete the offending comment.

**The function in rules:**

```
function noBlockedWords(body) {
  // Hard-core list only. Exporter re-checks the full list.
  return !body.matches('(?i).*(word1|word2|...|word50).*');
}
```

### 2.4 Reports

```
match /agents/{agentId}/reports/{userId} {
  allow get:    if isAdmin();
  allow list:   if isAdmin() && bounded();
  allow create: if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data)
                  && validReport(request.resource.data);
  allow update: if signedIn() && request.auth.uid == userId
                  && readableAgent(get(agentPath(agentId)).data)
                  && validReport(request.resource.data)
                  && request.resource.data.created_at == resource.data.created_at;
  allow delete: if false;
}

function validReport(data) {
  return data.keys().hasOnly(['reason', 'note', 'created_at', 'updated_at'])
    && data.reason in ['spam', 'harmful', 'misleading', 'other']
    && (data.note == null || (data.note is string && data.note.size() <= 500))
    && data.created_at is timestamp
    && data.updated_at == request.time;
}
```

Reports are admin-readable only. No export. No public file.

---

## 3. The blocked-words list — where it lives and how admins change it

### 3.1 Storage

```
public/blocked-words.json
```

A JSON array of lowercase strings, committed to the repository.

```json
["word1", "word2", "word3"]
```

**Why Hosting, not Firestore:** Firestore Security Rules cannot read a document from another collection at runtime (only `get()` calls to known paths are allowed, and they cost a read). Storing the full list in a Firestore document would make every comment write cost an extra read. Hosting serves a static file at zero cost.

**Why source-controlled, not a Firestore document:** the hard-core subset in `firestore.rules` must stay in sync with the full list. Keeping both in the repo means a single PR changes both; a code review enforces the update. An admin-editable Firestore document for the hard-core list would require a rules deploy on every change, which is non-trivial.

### 3.2 Two layers in the file

The browser and exporter read the full array. The rules hard-core subset is the first N entries of that array (by convention, documented at the top of the file). When an admin adds a new hard-core word they:

1. Add it to the front of `blocked-words.json`.
2. Update the regex in `firestore.rules` (the `noBlockedWords` function).
3. Open a PR. CI enforces the regex matches the first N entries (a simple test).
4. The PR merges: the new rules deploy, Hosting serves the new file.

Non-hard-core additions go to the end of the array and do not change rules.

### 3.3 Admin UX

A future Settings pane (admin only) shows the current list and links to the GitHub file for editing. For now, admins edit the file in the repository directly. No runtime editing through the Firebase console; the rules file must redeploy to extend coverage.

---

## 4. The change queue — how votes and comments join P3-7

### 4.1 New sources

`scripts/catalogChanges.ts` already defines the `sources` array:

```ts
export const sources = [
  'agents',
  'agent_versions',
  'skills',
  'skill_versions',
] as const
```

Add two more:

```ts
  'votes',
  'comments',
```

Each entry maps to a sub-path of `export_sources/{source}/changes/{id}`, where `id` is `{itemKind}/{itemId}` (for example `agents/my-agent-id` or `skills/my-skill-id`). This keeps one change marker per item, coalescing multiple votes or comments into a single export pass, exactly as the existing queue coalesces multiple agent writes.

### 4.2 When the marker is written

**Vote write (browser):** the same transaction that writes the vote document and updates the parent counter also writes the export marker, identical to the star pattern today. Only public approved items get a marker (the rules enforce this). The marker is written even on a vote change or retraction, because the counter changed.

**Comment create (browser):** a separate `set()` call after `addDoc` succeeds writes the marker. Comment creates are allowed on any readable parent (not only public approved), but the marker is only written — and only the exporter picks it up — for public approved items.

**Comment soft-delete (browser):** the update transaction writes the marker so the exporter removes the comment from the next static file.

**Rules enforcement:** the `validChange()` function in `export_sources` rules adds two clauses:

```
|| (source == 'votes'
    && id.matches('^(agents|skills)/[a-z0-9]+(-[a-z0-9]+)*$')
    && (liveApproved(get(agentPath(id.split('/')[1])).data)
        || liveApproved(get(skillPath(id.split('/')[1])).data)))
|| (source == 'comments'
    && id.matches('^(agents|skills)/[a-z0-9]+(-[a-z0-9]+)*$'))
```

(The exact path helpers need to handle both `agents/x` and `skills/x` ids in one rule clause.)

### 4.3 What the exporter reads per item

When a `votes/{agentId}` or `comments/{agentId}` marker is in the queue:

1. Read the parent `agents/{agentId}` document (1 read). Take `stats.thumbs_up`, `stats.thumbs_down`.
2. Read `agents/{agentId}/comments` with `where('deleted', '==', false)`, ordered by `created_at`, limit 100 (at most 101 reads per changed item). Filter through the full blocked-words list in process.
3. Update the catalog entry in memory and write the static file.

**No sub-collection scan on idle runs.** An idle hour with no markers reads zero vote or comment documents (same guarantee as the existing agent export).

### 4.4 Public files produced

#### `catalog.json` (agents) and `skills.json` (skills)

Each entry gains two new fields:

```json
"thumbs_up": 142,
"thumbs_down": 11
```

The exporter copies these from `stats.thumbs_up` and `stats.thumbs_down` on the parent document. No new Firestore reads beyond the parent (already read for other fields).

#### `ratings/{kind}/{id}.json`

A per-item ratings file, generated alongside `agents/{id}/{version}.json`:

```json
{
  "kind": "agent",
  "id": "my-agent-id",
  "thumbs_up": 142,
  "thumbs_down": 11,
  "comments": [
    {
      "id": "pushId123",
      "author_handle": "alice",
      "body": "Really useful for my pipeline.",
      "created_at": "2026-11-19T05:12:00Z"
    }
  ]
}
```

Deleted comments are excluded. The `author_uid` is stripped before writing (privacy). The file is only written when the item is public and approved; it is deleted from Hosting when the item is taken down (same mechanism as version files).

**Why a separate file, not embedded in `catalog.json`:** `catalog.json` is fetched on every page load. Comments can be long. Keeping them in a separate file means the catalog stays fast; comments are fetched on demand when the user opens an item's detail view.

The site loads `ratings/{kind}/{id}.json` from Hosting (zero Firestore reads), fulfilling invariant 3.

---

## 5. Read and write costs per hour

### 5.1 Assumptions

| Scale            | Items  | Votes/hr | Comments/hr | Changed items/hr      |
| ---------------- | ------ | -------- | ----------- | --------------------- |
| 14 items (today) | 14     | 0–2      | 0–1         | 1 (assumed 1 changed) |
| 1 000 items      | 1 000  | ~20      | ~5          | ~15                   |
| 10 000 items     | 10 000 | ~200     | ~50         | ~100                  |

"Changed items" is the number of distinct items that received a vote or comment in the hour.

### 5.2 Export reads per hour (incremental path)

Each changed item costs:

- 1 read for the `export_sources/votes/changes` or `export_sources/comments/changes` marker collection (amortized across all markers: 1 read regardless of count, because `select()` is used)
- 1 read per changed item's parent document
- Up to 101 reads per changed item for comments (bounded query, limit 100)

| Scale                     | Marker reads               | Parent reads | Comment reads | Total reads/hr |
| ------------------------- | -------------------------- | ------------ | ------------- | -------------- |
| 14 items, 1 changed       | 2 (votes + comments queue) | 1            | ≤2            | ~5             |
| 1 000 items, 15 changed   | 2                          | 15           | ≤315          | ~332           |
| 10 000 items, 100 changed | 2                          | 100          | ≤2 100        | ~2 202         |

At 10 000 items with 100 changed, the total is about 2 200 reads/hour, or 52 800/day. This is above the Spark limit of 50 000/day.

**Mitigation at 10 000 items:** cap comment reads per item at 50 (not 100). That halves the comment reads to ~1 300/hr at the 10 000-item scale, bringing the daily total to ~38 400 reads, below the 50 000 limit. The cap is a reasonable UX trade-off (most items will have fewer than 50 comments in the first years). The design should document this cap and the trigger for a full export vs. incremental.

A second mitigation: at very high volume, comments can be excluded from the incremental path and rebuilt only on the daily full run. This is a future option, not required now.

### 5.3 Write costs per hour (Firestore)

Votes: each vote write = 1 vote document write + 1 parent counter update + 1 export marker = 3 writes. At 200 votes/hr (10 000-item scale): 600 writes. Well within the 20 000/day limit.

Comments: each comment create = 1 comment document write + 1 export marker = 2 writes. At 50 comments/hr: 100 writes. Admin deletes: 1 write each.

---

## 6. The star migration

### 6.1 Strategy

Stars are stored in two places today:

1. `agents/{id}/stars/{userId}` sub-collection documents
2. `agents/{id}.stats.stars` counter

Both must be migrated atomically per item. The migration runs once, using an Admin SDK script, never through the browser client.

### 6.2 Preconditions (run before the migration)

- The new `stats.thumbs_up` and `stats.thumbs_down` fields are added to the `validAgent()` rule validation, **alongside** `stats.stars` (keep stars for the migration window).
- A new `agents/{id}/votes/{userId}` sub-collection is defined in rules.
- The migration script has Admin SDK credentials (service account).

### 6.3 Migration script — logic

```
for each agent document:
  begin transaction:
    read agents/{id}        (1 read)
    read agents/{id}/stars  (1 collection-group read; billed as 1 + count)
    for each star document:
      write agents/{id}/votes/{userId} with { value: 'up', created_at: star.created_at, updated_at: star.created_at }
    write agents/{id}: set stats.thumbs_up = count(stars), stats.thumbs_down = 0
    // do NOT delete stars yet — that is a second pass
  commit
```

Transactions in the Admin SDK can span sub-collections. For large counts, process in batches of 500 (Firestore batch write limit).

**Two-pass safety:** the star sub-collection is not deleted until the exporter has successfully published at least one run with the new thumbs counts. This allows rollback by re-reading stars if thumbs counts are wrong.

**Idempotency:** the script checks whether `stats.thumbs_up` already exists on each document. If it does, skip. This makes re-running safe.

### 6.4 Post-migration cleanup (second pass, after one successful export)

- Delete all `agents/{id}/stars/{userId}` sub-collection documents (Admin SDK, paginated).
- Remove `stats.stars` from each `agents/{id}` document.
- Remove `stats.stars` from the `validAgent()` rule (and the `validStarDelta()` and `starPath()` helpers).
- Remove the `toggleStarInFirestore` function and the star button UI.
- Remove `stats.stars` from the schema contract in `src/types/agent.ts`.

The cleanup is a separate PR, landing after a confirmed successful migration run.

### 6.5 Skills (no migration needed)

Skills have no stars today (`stats` holds only `updated_at`). The new `thumbs_up` and `thumbs_down` fields are added to `validSkill()` and initialized to 0 on skill creation.

### 6.6 Risk register

| Risk                                                         | Likelihood             | Mitigation                                                                                    |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------- |
| Transaction too large (>500 votes on one agent)              | Low (catalog is small) | Batch votes in groups of 499 per agent                                                        |
| Rules reject migration writes (stars and votes both present) | Medium                 | Add both `stars` and `thumbs_up` to the allowed `validAgent` keys during the migration window |
| Export publishes thumbs counts before migration finishes     | Low                    | Mark items as dirty after migration; full export run before site reads new counts             |
| A user votes during migration                                | Very low               | Transaction retries handle concurrent writes; worst case is a one-off vote                    |

---

## 7. "Top rated" sort

### 7.1 Current definition

The 2026-11-11 decision log entry reads: `"Popular" sorts by views, "Top Rated" by stars, "Newest" by updated_at`.

After P3-13, stars no longer exist. "Top Rated" now sorts by **net score** (thumbs up minus thumbs down), descending, then by `thumbs_up` descending as a tiebreaker.

```
sort key: (thumbs_up - thumbs_down DESC, thumbs_up DESC, updated_at DESC)
```

The sort is computed in the browser from `catalog.json` or `skills.json` (pure in-memory filter, as today). No new Firestore index is required for public browsing.

### 7.2 Justification

Net score (up minus down) is the standard Reddit / Stack Overflow approach. It surfaces items that users actively endorse over items that merely avoided thumbs down. Tiebreaking by raw `thumbs_up` count rewards engagement.

A pure `thumbs_up` sort would disadvantage old, controversial items over new, clean ones. A Wilson score lower bound (a statistical confidence interval) would be more robust but requires floating-point math in the browser and more complex exporter logic; it is deferred until the catalog is large enough to matter.

---

## 8. Screens

### 8.1 Vote buttons — agent and skill detail view

Placed below the description, before the comments section. Visual style follows §7.1: icons with plain numeric labels, no pill backgrounds.

```
👍 142    👎 11
```

- Both buttons are always visible to signed-out visitors (counts shown, clicking prompts sign-in).
- Signed-in users: pressing an unselected button casts that vote, pressing the selected button retracts it. Pressing the opposite button changes the vote.
- Selected state: the active button is visually highlighted (teal tint on the icon, no pill).
- Loading state: buttons are disabled while the Firestore transaction is in flight; counts update optimistically and roll back on failure with a plain error message.
- Signed-out: "Sign in to vote" appears on click, via `useAuth().openSignIn({ reason: 'vote' })`.

**Label wording (plain, as required by §7.1 "no pills"):**

- Unvoted: `👍 142` and `👎 11`
- Voted up: `👍 142` (highlighted) and `👎 11`
- Voted down: `👍 142` and `👎 11` (highlighted)

No "you voted" text overlay. The highlight is the signal.

### 8.2 Comments section — agent and skill detail view

Below the vote buttons, a new "Comments" heading (plain `h2`, not a tab).

**Signed-out view:**

```
Comments (3)
[comment 1]  [comment 2]  [comment 3]
Sign in to leave a comment.
```

**Signed-in view:**

```
Comments (3)
[comment 1] with an ×  [if author]
Add a comment
[textarea, 1–1 000 characters]
Post comment
```

Each comment shows:

- Handle (snapshot from the comment document)
- Relative time ("3 hours ago")
- Body text
- A "Delete" link for the author or any admin (plain text, no button style — this is a destructive action and the confirmation is a browser `confirm()` dialog)
- A "Report" link for anyone who is not the author (see §8.4)

Deleted comments are not shown (excluded from the static file).

**Blocked-word feedback in the browser:**
Before posting, the textarea is checked against the full `blocked-words.json` list (fetched once and cached in module scope). If a blocked word is found, the form shows a plain error message:

```
Your comment contains a word that is not allowed. Please edit it before posting.
```

The specific word is not named (avoids teaching users to work around the filter with alternate spellings). The post button remains disabled until the text is clean.

**Comment ordering:** chronological ascending (oldest first). No pagination in the first version; the static file caps at 50 non-deleted comments per item. A future "load more" link fetches from the static file (which will paginate) or a secondary static file.

### 8.3 Report button — item level

A "Report" link in the detail view, beside the author tag, visible to signed-in users who are not the item's author.

Clicking opens a small dialog (not a full page):

```
Report this item
○ Spam
○ Harmful content
○ Misleading description
○ Other

[Optional note, up to 500 characters]

[Cancel]  [Submit report]
```

Submitting writes `agents/{agentId}/reports/{userId}` or `skills/{skillId}/reports/{userId}`. A second submission from the same user updates the reason and note. After submission, the link becomes "Reported" (plain text, disabled).

### 8.4 Admin view — reports

A new tab "Reports" on the existing `/review` admin page. It shows a bounded list of items with at least one report, ordered by report count descending.

Each row shows:

- Item name and kind (agent or skill)
- Report count and the breakdown by reason
- A link to the item's detail view
- A link to the item's review page (for takedown)
- A "Clear reports" button (deletes all report documents for the item — Admin SDK operation, not available in browser rules; for the first version this is a note to the admin to use the Firebase console or a future admin tool)

**First-version limitation:** the browser client cannot delete report documents (rules deny it). The admin view is read-only except through the existing review/takedown flow. A future admin tool will add the clear button.

### 8.5 Admin view — comment moderation

Comments needing attention appear as a "Flagged comments" subsection of the Reports tab. A comment is flagged when:

- It contains a word on the full blocked-words list (caught by the exporter, logged with its comment id)
- It was reported through a future comment-report feature

For now, admins find flagged comments by their id (from the exporter log) and soft-delete them through the Firebase console. A future UI adds a list directly in `/review`.

---

## 9. Honest limits of word filters

A word filter is a friction layer, not a content policy guarantee. This section is honest about what it does and does not provide, and should be referenced in any future communications about content moderation.

**What the filter does:**

- Blocks a specific list of known-bad exact words (and simple variants, if added to the list).
- Provides fast feedback in the browser, reducing accidental posts.
- Gives the exporter a consistent, auditable list to enforce, so the static site never carries the blocked content.

**What the filter does not do:**

- Detect novel offensive language not on the list.
- Block intentional evasions (l33t speak, homoglyphs, deliberate misspellings, word splitting with punctuation).
- Replace human review. Comment volume at 14 items is manageable by the owner directly; a human moderation queue is the right long-term answer, not a longer word list.
- Guarantee real-time removal. A comment that bypasses the browser filter but hits the blocked-words check in the exporter will be blocked from the static file, but it sits in Firestore (soft-deleted by the exporter log and admin action) for up to one hour.

**The honest posture to adopt in UI copy:** "AgentLemon tries to keep comments helpful. Comments may be removed by the author, an admin, or our automated checks." Do not say "all offensive content is blocked."

---

## 10. Test plan

This plan is written so Codex or Antigravity can build the tests directly from these descriptions. Each test is listed with the kind of test file it belongs in, the emulator or static setup it needs, and the assertion.

### 10.1 Firestore rules tests (`tests/ratings.emulator.ts`, run by `npm run test:firestore`)

All tests use the Firestore emulator with pre-seeded user, admin, and agent documents.

| #    | Scenario                                                                                     | Assert                                                    |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| R-01 | Signed-out user gets a vote document                                                         | Denied                                                    |
| R-02 | Signed-in user casts a thumbs-up vote on a public approved agent (counter updated correctly) | Allowed; `stats.thumbs_up` increments by 1                |
| R-03 | Signed-in user changes vote from up to down (both counters updated)                          | Allowed; `thumbs_up` decrements, `thumbs_down` increments |
| R-04 | Signed-in user retracts vote (counter decrements)                                            | Allowed; counter decrements                               |
| R-05 | User votes on another user's private agent                                                   | Denied                                                    |
| R-06 | User votes on a friend's friends-visibility agent                                            | Allowed                                                   |
| R-07 | User votes on a pending (unapproved) public agent                                            | Denied                                                    |
| R-08 | Vote write omits `updated_at`                                                                | Denied                                                    |
| R-09 | Vote write sets `value` to an invalid string                                                 | Denied                                                    |
| R-10 | Signed-in user creates a valid comment on a public approved agent                            | Allowed                                                   |
| R-11 | Signed-out user creates a comment                                                            | Denied                                                    |
| R-12 | User with unverified email creates a comment                                                 | Denied                                                    |
| R-13 | Comment body is empty                                                                        | Denied                                                    |
| R-14 | Comment body is 1 001 characters                                                             | Denied                                                    |
| R-15 | Comment body contains a hard-core blocked word                                               | Denied (rules `noBlockedWords`)                           |
| R-16 | Comment body contains only non-hard-core words                                               | Allowed (browser/exporter check is out of scope here)     |
| R-17 | Author soft-deletes own comment                                                              | Allowed                                                   |
| R-18 | Admin soft-deletes any comment                                                               | Allowed                                                   |
| R-19 | Non-author, non-admin soft-deletes a comment                                                 | Denied                                                    |
| R-20 | Any client hard-deletes a comment                                                            | Denied                                                    |
| R-21 | Signed-in user submits a report with a valid reason                                          | Allowed                                                   |
| R-22 | Same user updates their existing report                                                      | Allowed                                                   |
| R-23 | Signed-in user reads the report collection                                                   | Denied                                                    |
| R-24 | Admin reads the report collection (bounded)                                                  | Allowed                                                   |
| R-25 | Admin reads the report collection unbounded                                                  | Denied                                                    |
| R-26 | Report with invalid reason                                                                   | Denied                                                    |
| R-27 | Report note exceeds 500 characters                                                           | Denied                                                    |
| R-28 | Vote on a public approved skill                                                              | Allowed                                                   |
| R-29 | Comment on a public approved skill                                                           | Allowed                                                   |
| R-30 | Export marker is written when a vote is cast on a public approved agent (same commit)        | Allowed; marker document exists                           |
| R-31 | Export marker write omitted on a vote for a non-public agent                                 | Allowed (no marker)                                       |

### 10.2 Exporter tests (`tests/catalog-export.test.ts` extensions)

| #    | Scenario                                                                                      | Assert                                       |
| ---- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| E-01 | Agent with thumbs counts exports `thumbs_up` and `thumbs_down` in `catalog.json`              | Fields present and correct                   |
| E-02 | A comment with a full-list blocked word is excluded from `ratings/{kind}/{id}.json`           | Comment absent from file                     |
| E-03 | A soft-deleted comment is excluded                                                            | Comment absent                               |
| E-04 | A non-deleted comment appears with `author_uid` stripped                                      | `author_uid` absent, `author_handle` present |
| E-05 | Comments are sorted chronologically                                                           | Order correct                                |
| E-06 | Comments capped at 50 per item                                                                | Only 50 appear                               |
| E-07 | Incremental run with a vote marker reads only the parent document and comments sub-collection | No other agent reads                         |
| E-08 | Idle hour (no markers) reads zero vote and comment documents                                  | Zero additional reads                        |

### 10.3 Browser/unit tests (`tests/ratings.test.ts`)

| #    | Scenario                                                         | Assert             |
| ---- | ---------------------------------------------------------------- | ------------------ |
| B-01 | `noBlockedWordsClient('hello world')` returns true               | No blocked words   |
| B-02 | `noBlockedWordsClient('buy now word1')` returns false            | Blocked word found |
| B-03 | Blocked-word check is case-insensitive (`WORD1` matches `word1`) | Blocked            |
| B-04 | `topRatedSort` orders by net score descending                    | Correct order      |
| B-05 | Tiebreaker: equal net score, higher `thumbs_up` ranks first      | Correct order      |

### 10.4 Migration script test (`tests/stars-migration.test.ts`)

| #    | Scenario                                                               | Assert           |
| ---- | ---------------------------------------------------------------------- | ---------------- |
| M-01 | Agent with 3 star documents migrates to `thumbs_up: 3, thumbs_down: 0` | Counters correct |
| M-02 | Re-running the migration on an already-migrated agent is a no-op       | Idempotent       |
| M-03 | Agent with no stars migrates to `thumbs_up: 0, thumbs_down: 0`         | Counters correct |

### 10.5 End-to-end (manual, Phase 3 verification P3-15)

1. Sign in as a user. Open an approved agent. Cast a thumbs-up. Confirm count increments optimistically. Wait for next hourly export. Reload. Confirm count in static file.
2. Change vote to thumbs-down. Confirm both counts update.
3. Sign out. Confirm vote buttons show counts but clicking prompts sign-in.
4. Sign in as a different user. Post a comment. Confirm it appears after export.
5. Try to post a comment with a blocked word. Confirm the browser blocks it.
6. Using a test client that bypasses the browser, attempt to write a comment with a hard-core blocked word directly to Firestore. Confirm the rules deny it.
7. Admin deletes the first user's comment. Confirm it disappears after the next export.
8. First user deletes their own second comment. Confirm it disappears.
9. Submit a report as a non-author. Admin opens `/review` → Reports tab. Confirms the item appears.
10. Run the star migration script against a seeded emulator. Confirm all star documents become vote documents with `value: 'up'`.

---

## README changes

The following rows and sentences should be added to `README.md` when this design is built and merged. **This document does not edit `README.md` itself** (see task scope: design only).

### Section 4 decision log — new row (newest first, above 2026-11-18 entries)

```
| 2026-11-19 | P3-13 design accepted (`docs/RATINGS.md`).
Firestore layout: `agents/{id}/votes/{uid}`, `comments/{auto}`, `reports/{uid}`;
same under `skills/{id}`. Aggregate counters `thumbs_up` and `thumbs_down` live on the
parent document and are copied into `catalog.json`, `skills.json`, and
per-item `ratings/{kind}/{id}.json` by the exporter. Blocked-words list in
`public/blocked-words.json`; hard-core subset compiled into a rules regex; full list
re-checked by the exporter. `export_sources` queue extended with `votes` and `comments`
sources. "Top rated" sorts by net score (up minus down) descending. Star migration:
one Admin SDK script copies each star to a `votes/{uid}` document with `value: 'up'`
and sets `thumbs_up` to the star count; star sub-collection deleted after one successful
export. |
```

### Section 1 "What exists today" table — new row (after P3-11 is built)

```
| Ratings | Built. Thumbs up and thumbs down on agents and skills; comments; reports; star migration done |
```

### Section 5 schema contract — `stats` map changes

Replace the `stats` row for agents:

```
| `stats` | `{ thumbs_up, thumbs_down, views, updated_at }` | `updated_at` is ISO 8601. `stars` removed in P3-13 |
```

For skills:

```
| `stats` | `{ thumbs_up, thumbs_down, updated_at }` | Vote counts added in P3-13 |
```

### Section 6 roadmap — P3-13 row status update

Change status from `open` to `done` (when the build lands).

### Section 7.1 visual style — additional label treatment row

Add to the label treatment table:

```
| Vote count | A 👍 or 👎 icon and a number, no background, no pill |
```
