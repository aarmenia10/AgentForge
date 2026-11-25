# Councils contract (P3-14)

Status: contract. Antigravity wrote it in P3-14. Later tasks build against it: data and security rules, screens, and the connector tools. The code half of the contract is `src/types/council.ts` and `src/lib/councilSchema.ts`, covered by `tests/council-schema.test.ts`. Where this document and that code disagree, fix one of them in the same pull request; neither silently wins.

The owner's decisions of 2026-11-18 and 2026-11-19 are fixed inputs and are not reopened here:

- A council bundles agents and skills that work together on a task, each pinned to a version, plus the coordination instructions for how they work together (roles, order, handoffs).
- Visibility is `public`, `friends`, or `private`, with the same review for public as agents.
- A public council may contain only public, approved members.
- "Export the council" from a chat saves any missing member as private first, then the council, all private.
- Visitors can take the whole council or single members.
- Items record the AI app they came from (`origin_app`, per the 2026-11-19 portability decision).

---

## 1. What a council is

A council bundles multiple specialist agents and skills into a coordinated team that collaborates to accomplish a complex task. Each member agent and skill is pinned to an exact immutable version (`<kind>:<id>@<version>`).

Along with the member roster, a council contains **coordination instructions**: the operational blueprint defining member roles, execution sequence or stages, handoff protocols between members, and synthesis of final deliverables.

A council does not run inference on AgentLemon servers (invariant 1). An AI app (Claude, ChatGPT, Codex, Antigravity) connects through the remote connector or local server, loads the council manifest, and orchestrates the members within its own execution context or multi-agent runner.

---

## 2. The council record and manifest

Field names are snake_case because records are serialized as-is to Firestore, public static files, and MCP payloads. `CouncilManifest` is the public shape; `CouncilRecord` adds storage fields.

| Field                    | Type                                    | Rule                                                                                                                                       |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `council_schema_version` | `1`                                     | Required literal discriminator. Named apart from agent `schema_version` and `skill_schema_version` so schemas cannot be confused           |
| `visibility`             | `'public' \| 'friends' \| 'private'`    | Same type as agents and skills (`AgentManifest['visibility']`)                                                                             |
| `id`                     | `string`                                | Lowercase slug, unique among councils; doubles as the Firestore document id. Council ids, skill ids, and agent ids are separate namespaces |
| `version`                | `string`                                | Semver string (e.g. `1.0.0`), same rule as agents and skills                                                                               |
| `name`                   | `string`                                | Descriptive display name, 1 to 64 characters. Non-blank                                                                                    |
| `description`            | `string`                                | Summary of what this council accomplishes, 1 to 1,024 characters. Non-blank                                                                |
| `author`                 | `AgentAuthor`                           | `{ uid, name, handle, verified }`, derived from the creator's profile on creation; `verified` false until an admin verifies                |
| `tags`                   | `string[]`                              | 1 to 10 lowercase slugs, unique. Shares discovery vocabulary with agents and skills                                                        |
| `origin_app`             | `string` (optional)                     | AI app this council was exported or saved from (e.g. `'claude'`, `'chatgpt'`, `'codex'`). Portability metadata                             |
| `instructions`           | `string`                                | Coordination blueprint: roles, execution pipeline, handoffs, and output synthesis. UTF-8 text, at most 100 KB                              |
| `members`                | `CouncilMember[]`                       | 2 to 20 pinned member agents and skills. Each member has `ref`, `role`, and `order`. See section 3                                         |
| `stats`                  | `{ updated_at: string }`                | ISO 8601 timestamp. Votes and comments arrive in P3-13; additive                                                                           |
| `owner_uid`              | `string`                                | Record only. Authenticated owner user ID                                                                                                   |
| `review_status`          | `'pending' \| 'approved' \| 'rejected'` | Record only. Admin review status for public councils                                                                                       |
| `saved_from_chat`        | `boolean` (optional)                    | Record only. Marked true when saved via connector `save_council` from chat                                                                 |

Like skills, a council record has no `shared_with`. Friends visibility is authorized through accepted relationship records (P2-5).

---

## 3. Members as item references

Councils reuse the canonical item reference standard defined in `docs/SKILLS.md` section 9.

| Form   | Shape                           | Example                                                          |
| ------ | ------------------------------- | ---------------------------------------------------------------- |
| Object | `ItemRef { kind, id, version }` | `{ "kind": "agent", "id": "code-reviewer", "version": "1.0.0" }` |
| String | `<kind>:<id>@<version>`         | `agent:code-reviewer@1.0.0`, `skill:pdf-forms@1.2.0`             |

A council member is represented as:

```ts
export interface CouncilMember {
  ref: ItemRef
  role: string
  order: number
}
```

- `ref`: Pinned pointer to an exact version of an agent or skill (`kind` is `'agent' | 'skill'`). Councils cannot contain unpinned or floating references.
- `role`: Functional responsibility in the council (1 to 200 characters, non-blank). Examples: "Database Migration Specialist", "Security Auditor", "Technical Writer".
- `order`: Positive integer (`>= 1`). Defines the stage or pipeline sequence:
  - Members sharing the same `order` number run concurrently or in parallel within that phase.
  - Members with higher `order` numbers execute in subsequent phases, receiving outputs and handoffs produced by earlier phases.
- Uniqueness: A council cannot contain duplicate member references (`kind:id@version`). Every member in `members` must point to a distinct item or version.

---

## 4. Limits

Sizes are measured in UTF-8 bytes of string content, matching Firestore string storage and Worker constraints.

| Limit              | Value                  | Constant                                     |
| ------------------ | ---------------------- | -------------------------------------------- |
| Council total size | 204,800 bytes (200 KB) | `COUNCIL_MAX_TOTAL_BYTES`                    |
| Instructions size  | 102,400 bytes (100 KB) | `COUNCIL_MAX_INSTRUCTIONS_BYTES`             |
| Members count      | 2 to 20 members        | `COUNCIL_MIN_MEMBERS`, `COUNCIL_MAX_MEMBERS` |
| Role length        | 200 characters         | `COUNCIL_ROLE_MAX`                           |
| Name length        | 64 characters          | `COUNCIL_NAME_MAX`                           |
| Description length | 1,024 characters       | `COUNCIL_DESCRIPTION_MAX`                    |
| Tags count         | 1 to 10 unique slugs   | `COUNCIL_MAX_TAGS`                           |
| Origin app length  | 64 characters          | `COUNCIL_ORIGIN_APP_MAX`                     |

### Why these numbers:

A Firestore document is capped at 1 MiB. A council contains references to members, not the members' full blueprints or files, so 200 KB leaves plenty of headroom for metadata, version history snapshots, and change detection queues. The 100 KB instruction cap provides ample space for detailed multi-stage protocols while preventing oversized instructions from dominating payload budgets. 2 to 20 members comfortably accommodates real-world agent teams while keeping review and authorization queries tractable.

---

## 5. Visibility, review, and the public-members rule

| Visibility | Who can see it                  | Allowed members                   | Review   |
| ---------- | ------------------------------- | --------------------------------- | -------- |
| `private`  | The author                      | Private, friends, or public items | None     |
| `friends`  | The author and accepted friends | Friends or public items           | None     |
| `public`   | Everyone, once approved         | **Public, approved items only**   | Required |

### 5.1 The Public-Members Rule

A public council may contain **only public, approved members**.

- If a council is marked `visibility: 'public'`, every member reference (`ref`) must point to an agent or skill that is currently approved and public in AgentLemon.
- Private councils may bundle private, friends, or public items owned by the author.
- Friends councils may bundle friends or public items accessible to the author and their friends.

### 5.2 How review treats new members inside a public council

When an author submits a council for public review, that council may reference newly created agents or skills that were also submitted for review:

1. **Council review is gated on member approval**: An admin reviewer cannot approve a public council while any referenced member is pending review, unapproved, private, or rejected.
2. **Review queue interface**: The admin review screen for councils lists every member with its current visibility and review status.
3. **Approval order**: Admin reviewers must approve the member agents and skills first. Once all members are public and approved, the council itself may be approved.
4. **Member takedown / visibility revocation**: If an approved public member is subsequently converted to private or rejected, the scheduled static export excludes the dependent public council from `public/councils.json` on the next hourly rebuild.

---

## 6. Firestore layout and rules

### 6.1 Layout

Mirrors agents and skills:

| Document                               | Holds                                                                             | Client access                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `councils/{id}`                        | Live `CouncilRecord`: approved public content, or current private/friends content | Same as `agents/{id}` and `skills/{id}`                  |
| `council_edits/{id}`                   | Pending edit proposal for an approved public council                              | Same as `agent_edits/{id}` and `skill_edits/{id}`        |
| `council_versions/{id}@{version}`      | Immutable snapshot of exact `CouncilRecord` at approval time                      | None. No client reads, updates, or deletes               |
| `export_sources/councils/changes/{id}` | Queue document recording writes to public approved councils for hourly CI export  | Managed in same batch write as council approval/takedown |

### 6.2 What the rules enforce and what readers enforce

**Security rules enforce**:

- Authenticated user owns `owner_uid` on creation and updates.
- Verified email required for creating public submissions or proposing edits.
- `council_schema_version == 1`.
- `members` is a list of 2 to 20 maps.
- Each member map contains `ref` (with `kind` in `['agent', 'skill']`, non-empty string `id`, semver `version`), string `role`, and positive integer `order >= 1`.
- `instructions` is a non-empty string.
- Friends visibility requires current accepted relationship (`users/{owner_uid}/relationships/{viewer_uid}`).
- Public approved council reads are world-readable in Firestore (though public discovery reads static `councils.json`).
- Version snapshots (`council_versions`) have zero client read/write access.

**Readers enforce**:

- `validateCouncilRecord` or `parsePublicCouncilVersion` runs on loaded data.
- Strict UTF-8 byte caps (`COUNCIL_MAX_INSTRUCTIONS_BYTES`, `COUNCIL_MAX_TOTAL_BYTES`).
- Member uniqueness (no duplicate `kind:id@version`).
- Role length limit (`COUNCIL_ROLE_MAX = 200`).
- Public-members rule: public reader checks that all referenced members are public and approved before rendering or serving.

---

## 7. Public files

Councils get their own public static files, keeping `catalog.json` and `skills.json` untouched so existing released servers never break.

### 7.1 Layout

| File                                  | Contents                                                                       | Written for                                         |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `public/councils.json`                | `CouncilIndex`: `{ council_schema_version: 1, councils: CouncilIndexEntry[] }` | Every council that is currently public and approved |
| `public/councils/<id>/<version>.json` | Exact `CouncilManifest`, storage fields stripped, instructions included        | Every approved version of each council above        |

- `CouncilIndexEntry` includes member summaries, tags, metadata, and `instructions_bytes`, but omits the full `instructions` text. This ensures `public/councils.json` remains lightweight for zero-Firestore-read browsing.
- Version files live at `public/councils/<id>/<version>.json`, generated via `councilVersionPath(id, version)`.
- `councils.json` carries **no timestamp or build ID** so CI compares byte digests cleanly.

### 7.2 Readers ignore unknown fields; writers reject them

- **Public readers** (`parsePublicCouncilIndex`, `parsePublicCouncilVersion`) use loose schemas: unknown fields are ignored so future additive changes never break released MCP clients or tools.
- **Writers** (`validateCouncilManifest`, `validateCouncilRecord`) use strict schemas: unknown fields are rejected to prevent storage bloat and invalid attributes.

---

## 8. Safety linter coverage

Coordination instructions are system-level multi-agent prompt directives that guide subagents, making them part of the prompt injection attack surface.

- `lintCouncil(council: CouncilManifest): LintResult` scans:
  - `name`, `description`, `tags`
  - `instructions` (the coordination text)
  - Each member's `role` string
- Runs standard safety linter rules (SL-01 to SL-15): instruction override phrasing, secrets extraction, shell commands, hidden unicode/zero-width characters, and unsafe links.
- Finding paths name exact locations, e.g. `instructions`, `members[0].role`.
- Under the 2026-11-14 decision, a `block` finding permits saving as `private`, but blocks sharing with friends and submitting for public review.

---

## 9. Save from chat and "Export the council"

In a connected chat (Claude, ChatGPT, Codex), the user can prompt: "Export this council to AgentLemon".

The export executes as an atomic two-phase save:

1. **Save missing members first**: The client or connector inspects the council's member roster. Any member agent or skill not already existing in the user's private library (or public catalog) is saved first via `save_agent` or `save_skill` as **private**.
2. **Save the council**: The council is saved via `save_council` as **private**, referencing the pinned `ItemRef`s of the members.
3. **Origin metadata**: `origin_app` records the connected client (e.g. `claude`, `chatgpt`) automatically without user input.

All items land safely on the user's `/me` page as private items with "Saved from chat" markers. Making any item public remains a deliberate action on the website requiring email verification and admin review.

### 9.1 Handoffs

Council instructions are what a fresh AI follows to run the members together. A line like "Check sources and gather papers in parallel, then build an evidence review." (the live sample `council:sample-research-desk@1.0.0`) names the stages but not what moves between them. Write, for each stage, what it produces, what the next stage receives, and in what form, for example: "Stage 1: the source checker returns a table of claims with source, quoted line, and confidence. Stage 2: the reviewer takes that table and the papers' abstracts and writes the evidence review, citing table rows."

`save_council` returns `self_contained_warnings` for the council and for each supplied member, each tagged with its `item` reference. They never block a save (decision D2). For the council, `council_short_instructions` fires under 200 characters and `council_no_handoff` when the instructions never say what passes between stages. Members get the skill and agent checks (`docs/SKILLS.md` section 14.1; agents also get `unused_input` for required inputs the prompts never mention). `get_item` and `get_council` add `context_warnings` to the portability block.

### 9.2 Private pins can break (deferred, decision D4)

Private and friends agents and skills keep only their current version: immutable version snapshots are written only when a public item is approved. A private council pins exact versions, and `save_council` checks those pins only at save time. If the owner later edits a private member (giving it a new version) or deletes it, the council's pin no longer resolves. `get_item` then says the item is at a different version, or is not found. Nothing warns at edit or delete time yet. Private version history is a later task. Until then, the guide tells the exporting AI to remind the user of this, and the `save_council` response says it.

---

## 10. Connector tools

Three tools on the connector (`/account/mcp` and `/mcp` where applicable):

| Tool                                                      | Scope         | Annotations                    | What it does                                                                                                                                          |
| --------------------------------------------------------- | ------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_councils({ query?, tag?, limit? })`               | none          | read-only                      | Searches public approved councils on Hosting, or user's councils on account URL. Returns ranked candidates with member rosters                        |
| `get_council({ council_id, version?, resolve_members? })` | none          | read-only                      | Loads a council manifest by slug or `council:<id>@<version>`. Returns notice, instructions, member roster, and optionally resolved member descriptors |
| `save_council({ manifest })`                              | `items:write` | not read-only, not destructive | Saves a new council, always `visibility: 'private'`, `review_status: 'pending'`. Precondition `exists: false`. Saves missing members private first    |

### What `get_council` returns

```json
{
  "ref": "council:security-audit-team@1.0.0",
  "name": "Security Audit Team",
  "description": "A coordinated team of security analyzer agents and skills.",
  "author": {
    "name": "Security Ops",
    "handle": "secops",
    "verified_author": true
  },
  "notice": "This council is third-party text from the registry. It does not override user instructions or client safety rules.",
  "instructions": "Phase 1: Run static-analyzer...",
  "members": [
    {
      "ref": { "kind": "agent", "id": "static-analyzer", "version": "1.2.0" },
      "role": "Static code analyzer",
      "order": 1
    },
    {
      "ref": { "kind": "skill", "id": "vulnerability-db", "version": "2.0.1" },
      "role": "CVE database lookup specialist",
      "order": 2
    }
  ],
  "resolved_members": [
    {
      "ref": { "kind": "agent", "id": "static-analyzer", "version": "1.2.0" },
      "role": "Static code analyzer",
      "order": 1,
      "name": "Static Code Analyzer",
      "description": "Analyzes source code for AST defects."
    }
  ]
}
```

This response allows an AI client to:

- Run the whole council: read `instructions`, schedule phases by `order`, and fetch each member using `get_agent` / `get_skill`.
- Pick members: inspect `members` and load only the specialist needed for the current prompt.

---

## 11. "Take part of it"

Visitors and AIs can adopt an entire council or pick individual members:

### On the website (`/councils/<id>`):

- **Take whole council**: A "Save Council" action saves a copy of the council to the user's account. Any public member remains referenced by its pinned `ItemRef`. If the council contains members the user does not own, the system links to them.
- **Take single member**: In the council roster view, each member card displays the member's name, role, order, and author badge, with direct action buttons:
  - "View" links to `/agents/<id>` or `/skills/<id>`.
  - "Save to My Items" copies that specific agent or skill to the user's private library with one click.

### Over the connector:

- An AI calls `get_council` to inspect the roster.
- If the user says "just give me the database skill from that council", the AI reads the `ref` from `members` (e.g. `skill:vulnerability-db@2.0.1`), and invokes `get_skill({ skill_id: "vulnerability-db", version: "2.0.1" })` or `save_skill`.
- If the user wants a trimmed-down council, the AI calls `save_council` with a filtered subset of `members` and adjusted instructions.

---

## 12. Module map

| Module                         | Contents                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/council.ts`         | `CouncilManifest`, `CouncilRecord`, `CouncilMember`, `CouncilIndexEntry`, `CouncilIndex`, `COUNCIL_SCHEMA_VERSION`, `ResolvedCouncilMember`, `GetCouncilResult`                                                                                                   |
| `src/lib/councilSchema.ts`     | Limits, strict writer schemas, loose reader schemas, `checkCouncil`, `validateCouncilManifest`, `validateCouncilRecord`, `parsePublicCouncilIndex`, `parsePublicCouncilVersion`, `councilVersionPath`, `formatCouncilRef`, `parseCouncilRef`, `councilTotalBytes` |
| `tests/council-schema.test.ts` | Unit tests for limits, member ordering, uniqueness, size caps, readers, writers, and the public-members rule                                                                                                                                                      |

`src/lib/councilSchema.ts` imports only `zod`, `./manifestSchema`, `./skillSchema`, and types. It contains zero Node APIs, zero Ajv, and no runtime code generation.

---

## 13. Choices this contract made

Beyond predetermined decisions, these choices were settled here and bind subsequent tasks:

1. `council_schema_version` (literal `1`), strictly separated from agent `schema_version` (`2`) and `skill_schema_version` (`1`).
2. Council IDs and references are their own namespace (`council:<id>@<version>`).
3. Members reuse `ItemRef` (`{ kind, id, version }`) from `src/types/skill.ts` without redefining the pointer shape.
4. Member count is bounded between 2 and 20 members (`COUNCIL_MIN_MEMBERS = 2`, `COUNCIL_MAX_MEMBERS = 20`).
5. Member `order` is a 1-based positive integer. Identical order numbers denote parallel execution stages.
6. Member `role` is capped at 200 characters and cannot be blank.
7. Coordination instructions are capped at 100 KB (`COUNCIL_MAX_INSTRUCTIONS_BYTES = 102,400 bytes`).
8. Total council size is capped at 200 KB (`COUNCIL_MAX_TOTAL_BYTES = 204,800 bytes`).
9. `origin_app` is an optional lowercase slug (max 64 characters) recording source AI app portability metadata.
10. `CouncilIndexEntry` omits coordination `instructions` and includes `instructions_bytes` and `member_count`, keeping `public/councils.json` compact for zero-Firestore-read browsing.
11. Public file readers use loose schemas ignoring unknown fields; write-path validators use strict schemas rejecting unknown fields.
12. Public-members rule is enforced across all public validation paths (`validateCouncilManifest`, `parsePublicCouncilIndex`, `parsePublicCouncilVersion`), requiring every referenced member to be approved and public.

---

## README changes

For the orchestrator to fold into `README.md` section 5, after "Skills (P3-8)":

```markdown
### Councils (P3-14)

`src/types/council.ts`, validated by `src/lib/councilSchema.ts` (zod only, safe in the Worker). Full contract in `docs/COUNCILS.md`.

| Field                    | Type                                              | Notes                                                                           |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `council_schema_version` | `1`                                               | Required literal discriminator, named apart from agent and skill schemas        |
| `visibility`             | `'public' \| 'friends' \| 'private'`              | As agents and skills. Public councils may contain only public, approved members |
| `id`, `version`          | `string`                                          | Slug and semver. Council ids are their own namespace                            |
| `name`, `description`    | `string`                                          | Name: at most 64 characters. Description: at most 1,024 characters              |
| `author`                 | `AgentAuthor`                                     | As agents and skills                                                            |
| `tags`                   | `string[]`                                        | 1 to 10 lowercase slugs                                                         |
| `origin_app`             | `string` (optional)                               | AI app this council was exported/saved from (e.g. `claude`, `chatgpt`)          |
| `instructions`           | `string`                                          | Coordination blueprint: roles, order, handoffs, and synthesis protocols         |
| `members`                | `{ ref: ItemRef, role: string, order: number }[]` | 2 to 20 pinned member agents and skills                                         |
| `stats`                  | `{ updated_at }`                                  | ISO 8601 timestamp. Vote counts arrive with P3-13                               |

Limits: 200 KB total, 100 KB instructions (UTF-8 bytes), 2 to 20 members, member role at most 200 characters, member order positive integer (>= 1).

`CouncilRecord` adds `owner_uid`, `review_status`, and optional `saved_from_chat` (no `shared_with`). Firestore mirrors agents and skills: live `councils/{id}`, pending `council_edits/{id}`, immutable `council_versions/{id}@{version}`. Councils never enter `catalog.json` or `skills.json`. Public files are `councils.json` (lightweight index omitting instructions) and `councils/<id>/<version>.json` for each approved version. Public readers ignore unknown fields; writers reject them.

"Export the council" from chat saves any missing members as private first, then the council, all private. Visitors can take the whole council or pick single members.
```
