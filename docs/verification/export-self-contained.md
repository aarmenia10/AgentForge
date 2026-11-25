# Manual test script: self-contained export round trip

- Task: make AgentLemon exports self-contained (brief `prompts/export-fix-worker.md`, acceptance criterion 6)
- Status: **not run yet**. The worker that built the change could not run it: it needs the owner's Canvas account and a second AI app.
- Tester: the owner (or Tommy), signed in to AgentLemon with a confirmed email
- Fill in the Result and Evidence columns, then commit this file with the results.

## What it proves

A skill saved under the new rules works in a different AI app with nothing but the AgentLemon account connector: no project folder, no attachments, no memory of the chat it came from.

## Before you start

- The pull request for this task is merged and deployed (connector and site).
- You have `tests/fixtures/cams45-selfcontained.json` from the repository. Its `skill` object is what you will save.
- Pick a new skill ID that is not taken, for example `cams45-portable`. Saving never replaces an item, so `cams45-claude` stays as it is.
- AI app A (where you save) and AI app B (where you test) are different apps, for example Claude and ChatGPT. Both have the AgentLemon account connector (`https://agentlemon-connector.lesslimit.workers.dev/account/mcp`) added and signed in. App B has **no** project, files, or custom instructions about CAMS 045.

## Steps

| # | Step | Expected | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1 | In app A, paste the `skill` object from the fixture, change `id` to your new ID, and ask: "Save this skill to AgentLemon with save_skill." | The AI shows the content first, then saves. The response has `visibility: "private"` and `self_contained_warnings: []` | | |
| 2 | In app A, ask: "Save the original cams45 to AgentLemon as a new skill `cams45-warning-check`", pasting `tests/fixtures/cams45-original.json` | Saved privately. `self_contained_warnings` lists at least: `absent_file` for `CAMS045_L02_Compiled_Reference.docx`, `hidden_context` for "this project", `tool_id` for `claude-in-chrome:*` and `ask_user_input_v0`, `skill_reference` for "the docx skill", `vague_location` for the Modules page. `next_step` asks to fix them and save under a new ID | | |
| 3 | In app B (fresh chat), ask: "Use get_skill to load cams45-portable." | The error says it is not in the public registry and names `get_item` on the account connector. It does not say the skill is broken or unavailable for another reason | | |
| 4 | In app B, ask: "Load my skill cams45-portable with get_item." | All four files come back (`SKILL.md`, `format-spec.md`, `example-output.md`, `inputs.md`). The portability block has no `context_warnings` | | |
| 5 | In app B, ask: "Run it for Lesson 12." | The AI asks for the course Modules URL (it does not guess one) and confirms the lesson's module items before reading pages | | |
| 6 | Let it finish. Paste video transcripts when asked, one at a time | It asks for each transcript by exact title, in lesson order | | |
| 7 | Open the document | Follows `format-spec.md`: Title, Subtitle, compile stamp, Contents, one Heading 1 per page, Heading 2/3 subsections, indented block quotes with citations, video transcripts as their own Heading 1, Resources Used This Lesson, Source Conflicts, Discussion Question Map. No other styles | | |
| 8 | Compare every image on the Lesson 12 pages in Canvas with the document | Every image has an *[Image description: ...]* line, taken from alt text where there is no description link, or *[No description in Canvas]* | | |
| 9 | Compare the discussion prompt and rubric with Canvas | Copied verbatim. The rubric has only what Canvas shows (criterion names, points, rating tiers), with no invented descriptions. Any reworded text starts with *Paraphrase:* | | |
| 10 | Look for outside facts | Every fact not from Canvas sits in an *Outside material (source: ...)* paragraph | | |
| 11 | Look for disagreements | Any conflict between pages (for example a point value on the Overview that differs from the discussion page) is listed under Source Conflicts with both sides quoted. "None found." if there are none | | |
| 12 | Check the top of the document | The compile stamp gives the date, the Modules URL, the lesson, and the skill reference used | | |
| 13 | Check the hard rules | No quiz, knowledge check, or exam was opened; skipped items show "(skipped: assessment)" in Contents; nothing was posted or submitted | | |
| 14 | Clean up | Delete `cams45-warning-check` from My items. Keep or delete `cams45-portable` as you like | | |

## Pass condition

Steps 1 to 13 pass. Step 2 shows the save-time warnings work. Steps 3 and 4 show the read-path errors. Steps 5 to 13 are the round trip from acceptance criterion 6: the document follows the bundled format spec, every image description is captured, verbatim text is kept verbatim, outside material is labelled, source conflicts are flagged, and there is a compile stamp, all without the original project.

## If something fails

Note which step, what the AI said, and which app and model ran it. A failure in steps 5 to 13 is most likely a gap in the skill text itself (fix `tests/fixtures/cams45-selfcontained.json` and save again under a new ID). A failure in steps 1 to 4 is a code problem.
