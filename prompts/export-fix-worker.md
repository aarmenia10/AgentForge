# Worker task: make AgentLemon exports self-contained

You are a Claude Code worker on AgentLemon, repo `aarmenia10/AgentLemon` (the old name `aarmenia10/AgentForge` redirects; if a push to AgentLemon returns 403, push to `https://github.com/aarmenia10/AgentForge`). You have no memory of the session that wrote this file. Everything you need is here or in the repo. Where this file and the repo disagree, the repo wins: say so in your report.

Branch: `task/export-self-contained`, cut from a freshly fetched `origin/main`. Open one pull request into `main`. Do not merge it. The orchestrator reviews and merges.

## 0. Read first

- `README.md` sections 0, 3 (invariants), 4 (decision log, binding; read every row from 2026-11-18 on), 8 (who does what, protected files).
- `docs/AI_GUIDE.md`, `docs/SKILLS.md`, `docs/COUNCILS.md`, `docs/CONNECTOR_AUTH.md` section 3.
- Do not edit README section 4 or the shared board. The orchestrator records decisions.

### Rules that bind this task (from the decision log; do not relearn them)

1. **Never add fields to agent entries in `catalog.json`, to agent version files, or to `src/types/agent.ts`.** Released local servers parse them strictly. The same caution applies to stored skill and council records: do not add stored fields. New information goes in **tool responses** (which servers build at read or save time), in **guide text**, or in **item text by convention**. Existing items and schema versions must keep working unchanged.
2. **`docs/AI_GUIDE.md` is a protected file.** The orchestrator is getting the owner's agreement for the guide changes in this task. Write the changes anyway, and list them in the PR description under "Protected file changes" so the agreement can be recorded. `packages/mcp-server/src/guide.ts` holds a generated copy: after editing the guide, run `node packages/mcp-server/sync-guide.mjs`. `CONDENSED_GUIDE` and `CONNECTOR_CONDENSED_GUIDE` in the same file are hand-written and must keep the same rules.
3. **Any change under `packages/mcp-server/src`** (and the shared files it bundles from `src/lib`) needs a version bump in `packages/mcp-server/package.json` (0.3.4 now, so 0.3.5) and `npm run release:mcp`, so the committed tarball in `public/mcp/` matches the source. Never delete an old tarball. Update the version constant in `src/lib/mcpConfig.ts` if one exists for it (check).
4. **Connector changes** (`packages/connector`): also run `npm ci`, `npm run check`, and `npm run benchmark` inside `packages/connector`.
5. Workers reject `fetch(..., { redirect: 'error' })`; use `'manual'`.
6. No paid infrastructure, no new services, no secrets. Firestore rules and `firestore.rules` are out of scope: do not touch them.
7. Make no destructive changes to stored data. No migrations.

## 1. The test case

The owner exported a private skill, `cams45`, from a Claude chat into AgentLemon. It is stored as `cams45-claude@1.0.0`. It compiles a Penn State CAMS 045 Canvas lesson into one reference document and maps the week's discussion questions to the sections that answer them. Another AI (ChatGPT or Codex) built the Lesson 12 reference doc using that skill plus the owner's project folder. A Claude session audited that doc against live Canvas and against the skill text. The body text was accurate. The problems traced back to what the skill and the export did and did not carry.

The full SKILL.md, exactly as stored, is in Appendix A. It is the only file in the item. The orchestrator confirmed this on 2026-11-25 by reading the item with `get_item(kind="skill", id="cams45-claude")`.

### Findings from the audit

- **F1. The export carried only SKILL.md, and the skill depends on project-only context.** It says to match "the CAMS045_L02_Compiled_Reference.docx already in this project", to go to "the course Modules page" (no URL, course ID, or module ID), and to match "the L02 doc's formatting convention" (no style spec). Consumers filled the gaps from the owner's project folder, and the format drifted: L02 uses Heading 1 to 3 only; L11 adds Title, Subtitle, Quote styles and rubric text; L12 adds six custom styles, 26 per-section source links, and an embedded evidence guide. A fresh AI with only the skill would produce the plain L02 layout.
- **F2. A procedure that silently fails with a different tool.** The skill says to click "text description" links and read them with a page-text tool. That lesson's images have no such links. Their descriptions live only in `alt` attributes, and the page-text tool drops alt text (verified). An AI following the skill literally captures zero image descriptions. The skill never says how to read alt text, or that Canvas exposes page bodies through its API.
- **F3. No fidelity rules.** The skill says to extract the "full prompt text" and "rubric link if present". It does not say to copy verbatim, label outside sources, or flag discrepancies between sources. The consumer paraphrased the prompt, invented rubric descriptions that do not exist in Canvas (the real rubric has criterion names, points, and Excellent/Average/Poor tiers only), presented a condensed rewrite as Canvas's own text, and added outside facts without labelling them. It did flag one real discrepancy (the Overview says 10 points, the discussion and rubric say 20), but nothing in the skill told it to.
- **F4. Detection rule too narrow.** Videos are detected by a "Video N.N" label. Lesson 10 has a "Guest Video" page and a "Video Analysis" page with no such label.
- **F5. No compile date or staleness stamp** in the output spec.
- **F6. Tool-name coupling.** The skill hard-codes `claude-in-chrome:*`, `ask_user_input_v0`, `tool_search`, and "the docx skill". The connector's portability note ("use your own equivalent") partly covers this. It gives no fallback when no equivalent exists, and the skill never states the minimum capability it needs (an authenticated browser session, or a user-pasted export).
- **F7. Misleading read-path tools and errors.** `get_skill` returned "Skill is unavailable." for a private skill owned by the signed-in user, while `get_item(kind="skill", id=...)` works. `search_skills` and `get_skill` read the public registry only, and nothing in their descriptions or errors says so. The calling AI wasted a turn and gave the owner a wrong diagnosis (visibility). Reproduced by the orchestrator on 2026-11-25.
- **F8. No exporter guidance.** The guide at `agentlemon://guide` explains choosing and loading items and how to export a council. It says nothing about exporting a skill or an agent. `save_skill` accepts files of kind `reference` and `script`, but nothing tells the exporting AI to bundle the files the skill refers to.
- **F9. No save-time validation.** The schema accepts a skill whose text refers to files, projects, URLs, or identifiers that are not in the bundle.
- **F10. Portability detection is shallow.** The item reported `detected_tools: ["Claude in Chrome"]`. It did not detect references to absent files, "this project" phrasing, hard-coded tool IDs, or other skills.

## 2. Repo findings (orchestrator, 2026-11-25; verify each before relying on it)

### Where things live

| Path                                               | What it is                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/connector/src/accountTools.ts`           | Account tools: `account_status`, `list_my_items`, `get_item`, `save_agent`, `save_skill`, `save_council`. `prepareChatSave()` (about line 365) normalizes and validates a chat save. `saveItem()` returns `{ id, kind, visibility, review, url, findings, next_step }`. `getItem()` (about line 271) reads public first, then the owner's Firestore doc.                                                                               |
| `packages/connector/src/server.ts`                 | Connector tool list and descriptions, including `get_agent`'s. Guide prompt and resource.                                                                                                                                                                                                                                                                                                                                              |
| `packages/connector/src/connector.ts`              | Request handler; `publicSkill()` throws `'Skill is unavailable.'` on a fetch failure.                                                                                                                                                                                                                                                                                                                                                  |
| `packages/mcp-server/src/skills.ts`                | `search_skills`, `get_skill`, `get_skill_file` (shared by the local server and the connector). `resolve()` throws `'Skill is unavailable.'` when the id is not in public `skills.json`, which is the F7 message.                                                                                                                                                                                                                       |
| `packages/mcp-server/src/councils.ts`              | `search_councils`, `get_council` (public only; the description does say "public").                                                                                                                                                                                                                                                                                                                                                     |
| `packages/mcp-server/src/shared.ts`, `versions.ts` | `search_registry`, `compare_agents`, agent resolution; errors like "Agent/version not found: x; no version substitution was made". Nothing says "public only".                                                                                                                                                                                                                                                                         |
| `packages/mcp-server/src/guide.ts`                 | Guide text (generated from `docs/AI_GUIDE.md` by `sync-guide.mjs`) plus the hand-written condensed guides.                                                                                                                                                                                                                                                                                                                             |
| `docs/AI_GUIDE.md`                                 | Canonical guide, protected. Section 12 covers council export (`save_council`) and loading private councils with `get_item`. There is **no section on exporting a skill or an agent, and no mention of `get_item` for private skills or agents.** The section 3 tool table lists only the local server's tools (`switch_agent`, `agent_<id>`), not the connector's.                                                                     |
| `src/lib/portability.ts`                           | `APP_SPECIFIC_TOOLS`: an allowlist of about ten app names (Claude in Chrome, Claude Code, Artifacts, Code Interpreter, and so on). `detectAppTools()` matches only those names. `createPortabilityBlock()` builds `{ origin_app, detected_tools, note }` at read time. Nothing checks file references, project phrasing, namespaced tool IDs, or placeholders.                                                                         |
| `src/lib/skillSchema.ts`                           | Skill limits: 50 files, 100 KB per file, 200 KB total, path rules, and `SKILL_REFERENCE_EXTENSIONS` (md, txt, csv, json, yaml, xml, and similar). **Binary files (images, PDFs, .docx, archives) are rejected** by `isBinarySkillFile()`/`decodeSkillFile()`, so the L02 `.docx` that the cams45 skill names **cannot be bundled at all**. `validateSkillManifest()` checks shape and limits only, not whether referenced files exist. |
| `src/lib/manifestSchema.ts`, `src/types/agent.ts`  | Agent schema. `tools_required[]` has `name`, `type`, optional `endpoint`, and `description`. There is no field for a fallback or a minimum capability, and one must not be added (rule 1). Nothing checks that the prompts use the input schema's required fields.                                                                                                                                                                     |
| `src/lib/councilSchema.ts`                         | Council schema and limits.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/components/skills/SkillUpload.tsx`            | Web upload. Ignored paths (dotfiles, `node_modules`, and so on) are skipped and listed; binary files are rejected with a reason. Not silent, but there is no reference check either.                                                                                                                                                                                                                                                   |
| `src/services/skillStore.ts` (about line 109)      | Immutable `skill_versions/<id>@<version>` snapshots are written **only on approval** (public items).                                                                                                                                                                                                                                                                                                                                   |

### New findings beyond F1 to F10

- **R1. Private pins can drift or disappear.** `getItem()` reads a private agent or skill from its single current document and treats a different `version` as unavailable. Private items have no version snapshots, so after the owner edits a private member (a new version), or deletes it (owner deletion, decision 2026-11-23), any private council pinned to the old version can no longer resolve that member. `save_council` checks pins only at save time. Nothing warns at edit or delete time. (Verify with an emulator test before you rely on this.)
- **R2. A re-export cannot replace an item.** `save_skill` and `save_agent` only create new items (on a taken ID: "This ID is already taken. Choose a new item ID."). An improved cams45 has to be saved under a new ID or edited on the site. The guide never says so.
- **R3. Council instructions can be one line.** The live public sample `council:sample-research-desk@1.0.0` has the instructions "Check sources and gather papers in parallel, then build an evidence review." and nothing about what each stage hands to the next. The schema accepts any non-empty text.
- **R4. Lint is skipped on larger chat saves.** `prepareChatSave()` skips the safety linter above `INLINE_LINT_BYTES` (12 KiB) and returns `findings: null` with a note. Not lossy, but any new save-time checks must not be skipped the same way.
- **R5. The guide's tool table is stale for connector users** (see the AI_GUIDE row above). An AI on the connector reads a table that omits `get_item`, `get_skill`, and the save tools.

Classes: missing bundled context (F1, binary files in the skillSchema row, R2); tool or method assumptions (F2, F6); missing fidelity rules (F3, F4, F5); missing validation (F9, R3, R4); misleading tools or errors (F7, R5); missing exporter guidance (F8, R2); provenance and staleness (F5, R1).

## 3. Work items

### W1. Guide: "Exporting a skill, agent, or council" (F8, F1 to F6, R2)

Add a new section to `docs/AI_GUIDE.md`, then sync `guide.ts`. Add a short version to both condensed guides. Keep the existing council export text, linked from the new section. The section tells the exporting AI to work through this checklist with the user **before** calling `save_skill`, `save_agent`, or `save_council`, and to show the user what it will save:

1. **Bundle every file the item refers to** as a `reference` file. Binary files cannot be saved. Convert them instead: for a document template, save a Markdown format spec (headings and styles used, with their names, list and quote conventions, citation format) plus a short excerpt of a finished example.
2. **No hidden context.** Replace "this project", "the attached file", "above", "as we did", and local paths with the actual content, or bundle it.
3. **State hard facts:** every URL, ID, style name, naming rule, and number a fresh AI would need. If a value is personal or changes per use, write it as an explicit input the AI must ask the user for, not a silent gap.
4. **Include one finished example output** (or a trimmed excerpt) as a reference file.
5. **Tools:** describe each step by capability ("an authenticated browser session that can read the course page"), name the tool the author used only as an example, give a fallback for when no equivalent exists (for example "ask the user to paste the page text or export"), and state the minimum capability needed up front.
6. **Fidelity rules** for any step that extracts or copies: copy source text verbatim, mark any paraphrase as a paraphrase, label outside material, never invent missing parts (say they are missing), and flag disagreements between sources.
7. **Detection rules that cover the variants.** Do not rely on one label pattern; say what to do when an item matches none.
8. **A compile or freshness stamp** in any generated output (date compiled, source, version of the item used).
9. **Agents:** check that the prompts use every required input field and produce every output field. Use `tools_required[].description` for the fallback and minimum capability (no new fields).
10. **Councils:** instructions must say what each stage hands to the next and in what form. Pin exact versions. Remind the user that editing or deleting a private member can break the council (R1).
11. **Saving creates a new item.** To revise one, save under a new ID or edit it on the site (R2).
12. **Test it:** after saving, load the saved copy with `get_item` in a fresh chat, ideally in a different AI app, and run it with no other context.

Also fix R5: make the tool table name the connector's tools, or add a connector table, and say plainly that `search_*` and `get_skill`, `get_agent`, and `get_council` read the **public** registry, while `get_item` reads the user's own private and friends items on the account connector.

### W2. Read-path descriptions and errors (F7)

- Descriptions of `search_skills`, `get_skill`, `get_skill_file`, `search_registry`, `get_agent` (connector), `search_councils`, and `get_council` say they cover the **public** registry only, and point to `get_item` (account connector) for the user's own private or friends items.
- When a public lookup finds no item, the error says so and is actionable. For example: `Skill "cams45-claude" is not in the public registry. If it is your own private or friends-only skill, read it with get_item (kind "skill") on the AgentLemon account connector.` Apply the equivalent to agents and councils. Keep a genuine fetch failure distinct ("AgentLemon is unreachable right now"), so a network problem never reads like "not public". On the local server, which has no `get_item`, say how to get it (the account connector link) rather than naming a tool the client does not have.
- `get_item` errors should say whether the ID was not found, the version differs (name the current version), or the item is not visible to this account. Do not reveal whether someone else's private item exists: "not found or not visible to your account" is fine for that case.

### W3. Save-time checks (F9, F10, R3, R4)

Add a pure function, for example `checkSelfContained(item)` in a new `src/lib/selfContained.ts` (Worker-safe: no Node APIs), that returns warnings with a code, a message, and the matching text. It never blocks a save in this task (see open decision D2). Run it in `prepareChatSave()` for agents and skills, in `save_council` for the council and each supplied member, and in the web upload and Studio flows if that is simple and clean (state where you added it). Return the warnings in the save response as a new field, for example `self_contained_warnings` (a response field, not stored), plus a `next_step` line asking the AI to fix them with the user and save again under a new ID. Always run it, whatever the size (unlike the linter in R4).

Patterns, each with tests, low false positives preferred:

- **Absent files:** file names with extensions (`.docx`, `.pdf`, `.md`, `.csv`, and so on) mentioned in the text that are not paths in the bundle. Skills only; for agents, any file name.
- **Hidden context:** "this project", "the project folder", "attached", "already in", "the doc/file above", "as we did", "we built", "earlier in this chat", and local paths (`C:\`, `/Users/`, `~/`).
- **Vague locations:** "the X page" or "go to ..." with no URL anywhere in the item (one warning per item, not per line).
- **Hard-coded tool IDs:** namespaced IDs (`name:tool`, for example `claude-in-chrome:navigate`), snake_case identifiers in backticks that look like tool calls (`ask_user_input_v0`, `tool_search`, `web_fetch`), and references to other skills ("the docx skill"). Report them as portability warnings with the advice in W1 item 5.
- **Unfilled placeholders:** `<...>`, `TODO`, `TBD`, `XXX`.
- **Councils:** instructions shorter than about 200 characters, or with no mention of what passes between stages (R3).
- **Agents:** required `input_schema` properties never mentioned in `system_prompt` or `instructions`.

### W4. Broader portability detection at read time (F10)

Extend `createPortabilityBlock()` (or a sibling) so `get_item`, `get_skill`, `get_agent`, and `get_council` responses also include the W3 warnings (call the field something like `context_warnings`), next to `detected_tools`. Keep `detected_tools` exactly as it is for existing readers. Add the namespaced-tool and skill-reference patterns to detection without flagging bare words like "Canvas" (keep the existing guard in `portability.ts`).

### W5. Fixtures (sanitized)

- `tests/fixtures/cams45-original.json`: the skill exactly as in Appendix A, with author `uid` set to a fake value and author `name` and `handle` set to `Test Author` and `test-author`. No other personal data.
- `tests/fixtures/cams45-selfcontained.json`: a corrected version that follows the W1 checklist, written by you from Appendix A plus the findings. It must not need the owner's project. It includes, as reference files: `format-spec.md` (the L02 layout as text: Title and subtitle, one Heading 1 per Canvas page, Heading 2 and 3 for subsections, block quotes for primary sources with citations, image descriptions inline in square brackets and italics, video transcripts as their own Heading 1 at their position, a "Resources Used This Lesson" section, and a compile stamp), `example-output.md` (a short, made-up excerpt in that format; do not copy any real course text beyond what Appendix A contains), and `inputs.md` (what the AI must ask the user for: the course Modules URL and the lesson number). Steps are written by capability, with a fallback (ask the user to paste page text or a page export), and they cover reading image descriptions from `alt` attributes, the Canvas pages API as an option when the user's session allows it, verbatim copying, labelling outside material, flagging source conflicts, video detection by page type and title rather than a "Video N.N" label alone, and the compile stamp.

### W6. Tests

- One regression test per finding (F1 to F10) and per repo finding you change (R2 to R5); R1 can be a documented emulator test or a note if it is out of scope (D4).
- Round trip (automated): save `cams45-original` through `prepareChatSave()` and confirm the expected warnings appear (absent `.docx`, "this project", hard-coded tool IDs, other-skill reference, vague location). Save `cams45-selfcontained` and confirm no warnings. Read both back through the `get_item` path (use the existing connector test fixtures, `tests/connectorFixture.ts`, or the emulator tests, whichever the repo already uses for `get_item`) and confirm every file survives byte for byte and the portability block includes `context_warnings` for the original only.
- F7: `get_skill` on a private-only ID gives the new public-only message that names `get_item`; a fetch failure gives the "unreachable" message instead.
- Existing items: every agent in `public/catalog.json`, the seed data, and the existing skill and council test fixtures still parse, load, and render exactly as before. Add a test that the new warning field is absent or empty for all 14 catalog agents, or list any warnings they get and justify them.

### W7. Docs

- `docs/SKILLS.md`: a short "Self-contained skills" section (bundling, binary conversion, the warnings and what they mean).
- `docs/COUNCILS.md`: handoff guidance and the private-pin caveat (R1).
- A manual test script in `docs/verification/` (look at the existing files there for the format) for the human round trip below.

## 4. Acceptance criteria

1. All six checks pass: `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, `npm run test:package`, `npm run test:firestore` (Java 21; never skip). For connector changes also `npm ci`, `npm run check`, and `npm run benchmark` in `packages/connector`. Report the real counts.
2. The MCP package version is bumped, `npm run release:mcp` has been run, and the committed tarball matches the source (`npm run test:package` checks this).
3. Every W6 test passes, including one regression case per finding.
4. Existing items and schema versions work unchanged: no stored-field changes, no changes to `src/types/agent.ts`, and the released local servers' parsing of `catalog.json` is unaffected.
5. Saving the original cams45 fixture returns specific, actionable warnings; saving the self-contained fixture returns none.
6. **Human round trip (manual, documented in `docs/verification/`, not run by you):** the owner saves the self-contained cams45 under a new ID, opens a fresh chat in a different AI app with only the AgentLemon account connector, loads it with `get_item`, and produces the Lesson 12 reference doc without access to the original project. Success means the doc follows the bundled format spec, every image description is captured, verbatim text is marked as verbatim, outside material is labelled, source conflicts are flagged, and there is a compile stamp. You cannot run this (it needs Canvas and a second AI), so say so in your report rather than claiming it.

## 5. Constraints

- Work on the branch and open a PR. Do not merge.
- No destructive changes. No changes to stored data, `firestore.rules`, `src/types/agent.ts`, or `.github/`.
- Warnings only: no save may be blocked by the new checks in this task.
- Fixtures use only the cams45 skill text in Appendix A, with a fake author. No personal data, course IDs, or real student content.
- Keep the diff focused. Do not restyle the site.
- Do not edit README section 4 or the shared board.

## 6. Open decisions (the orchestrator is asking the owner; build to the default shown)

- **D1.** Guide changes to the protected `docs/AI_GUIDE.md`. Default: write them; the orchestrator records the owner's agreement before merging.
- **D2.** Warn or block on save. Default: warn only.
- **D3.** Binary files (.docx) stay unsupported; exporters convert them to text specs. Default: yes.
- **D4.** Private version history (R1) is out of scope for this task. Default: document the caveat and add the warning only.

## 7. Report format (reply with exactly these sections)

1. **What changed:** files, with one line each.
2. **Protected file changes:** the exact `docs/AI_GUIDE.md` sections added or changed.
3. **What was tested:** each check with real counts; each W6 test by name; anything you ran by hand.
4. **Repo facts that differed from this file:** with paths.
5. **What is still open:** including the manual round trip and anything in D1 to D4.
6. **PR link.**

---

## Appendix A: `cams45-claude@1.0.0` SKILL.md, exactly as stored (the only file in the item)

```markdown
---
name: cams45
description: "Compile a full CAMS 045 (Classical Mythology) Canvas lesson into one reference document, and map that week's discussion questions to the specific sections that answer them. Trigger on '/cams45', 'cams45 lesson N', or a request to pull together a CAMS 045 lesson."
---

# CAMS 045 Lesson Compiler

Builds what we built by hand for L02 — a single compiled reference doc covering
every page in a lesson module, plus a pointer guide mapping each discussion
question to where its evidence lives — but does the Canvas legwork automatically
instead of the user copy-pasting page by page.

## Required tools

This skill only works through **Claude in Chrome** (`claude-in-chrome:*` tools),
because Canvas requires the user's logged-in session — `web_fetch` cannot
reach it. If these tools aren't loaded yet, call `tool_search` for "chrome
browser navigate" first.

Before any navigation:

1. Call `claude-in-chrome:list_connected_browsers`.
2. If exactly one browser is connected, confirm with the user via
   `ask_user_input_v0` before selecting it (don't assume silently, even with
   only one option) — offer their browser plus the "let me pick in Chrome"
   option.
3. Call `claude-in-chrome:select_browser` (or `switch_browser` if the user
   asked to pick manually) before navigating anywhere.

Core tools used throughout:

- `claude-in-chrome:navigate` — go to Canvas URLs
- `claude-in-chrome:computer` (screenshot, left_click, scroll) — expand
  modules, click image-description links, click Next
- `claude-in-chrome:get_page_text` — extract page and revealed-panel text
- `claude-in-chrome:browser_batch` — batch sequential clicks/screenshots

## Hard rules (never violated)

- **Never click, open, or interact with anything labeled Quiz, Knowledge Check,
  or Exam.** Read-only navigation only. If a module item's name contains any of
  those words, skip it — note it in the compiled doc's table of contents as
  "(skipped — assessment)" and move on.
- **Never submit, answer, or check off anything.** This skill only reads and
  compiles. No form fields, no discussion posts, no quiz attempts.
- **Never fabricate content.** If a page fails to load or a section is unclear,
  say so explicitly in the doc rather than guessing or smoothing it over.

## Workflow

### 1. Get the lesson number

If not given, ask: "Which lesson number?" Accept "L02", "2", "lesson 2", etc.

### 2. Navigate and confirm the module

Go to the course Modules page. Find "Lesson 0N: ..." and expand it. List the
module items back to the user in one message before doing anything else —
this confirms we're compiling the right lesson and lets the user see the full
item list (including which items are quizzes, so they can see what's being
skipped).

### 3. Walk every non-assessment page in order

Starting from the Overview page (captures lesson objectives and deliverables —
don't skip this even though it's not "content" in the mythology sense), use
Next-page navigation to move through the module sequentially. For each page:

- **Text pages:** extract with the page-text tool directly.
- **Image description links** ("... text description"): click to expand the
  inline preview, then extract that panel's text. Do this for every image on
  every page — don't stop at the first one found on a page.
- **Video pages:** do NOT attempt transcript extraction (too costly — many
  scroll/read cycles per video, confirmed in testing). Instead:
  - Note the video's title and lesson-numbering label (e.g. "Video 2.1",
    "Video 3.1") exactly as Canvas displays it.
  - Record its position in the page sequence, so the transcript can be
    slotted back into the right place in the final doc.
  - Do not click play or open the transcript panel at all.

### 4. Collect the discussion assignment

Find that lesson's Discussion Topic assignment (e.g. "L02 Analytical
Discussion") under Assignments. Extract the full prompt text — questions,
instructions, rubric link if present. Do not open or interact with the
discussion itself (no posting).

### 5. Ask for video transcripts — the one manual step

If the lesson had one or more videos, stop and ask the user for them by name,
one at a time, in the order they appear in the lesson:

> "This lesson has [N] video(s). Paste the transcript for **[exact video
> title, e.g. 'L02 The Creation of the Gods (Video 2.1)']** whenever you're
> ready, and I'll slot it into the doc in the right place."

If there's more than one video, ask for them one at a time in lesson order,
not all at once — matches how the user actually copies them out of Canvas.

If the lesson has zero videos, skip this step entirely.

### 6. Build the compiled reference doc

Once all text/image content is gathered and all video transcripts are in
hand, build a single .docx following the same structure as the
CAMS045_L02_Compiled_Reference.docx already in this project:

- Title + subtitle
- One H1 section per Canvas page, in lesson order, using that page's own
  heading structure (H2/H3 for subsections)
- Block quotes for primary-source passages, with source citations kept
- Image descriptions inline, bracketed and italicized, matching the L02 doc's
  formatting convention
- Video transcripts inserted as their own H1 section at the point they occur
  in the lesson sequence, clearly labeled with the video's title
- A "Resources Used This Lesson" section at the end, if the Summary page
  lists one

Use the docx skill's build process (docx-js, US Letter, verify by rendering
to PDF before presenting).

### 7. Map the discussion questions

After the doc is built, go question-by-question through the discussion
prompt collected in step 4, and state plainly which page/section of the
compiled doc contains the evidence for each — the same way this was done
manually for L02 Q1–Q3. Distinguish between:

- Questions answered by lesson content (point to the specific page)
- Questions answered only by an assigned primary-source passage pasted
  directly into the discussion prompt itself (make clear this is separate
  from the Canvas lesson pages)
- Anything not covered anywhere — say so, don't guess

### 8. Present the file

Save the compiled doc to outputs and present it. Do not draft the actual
discussion post content unless separately asked — this skill's job ends at
"here's your study doc" and "here's where to look for each question."

## What this skill does not do

- Does not extract video transcripts itself (user pastes these)
- Does not open, attempt, or submit any quiz/knowledge check/exam
- Does not write or submit discussion posts
- Does not grade or check the user's draft answers against the rubric —
  that's a separate, already-established part of this project's normal
  workflow, not this skill
```
