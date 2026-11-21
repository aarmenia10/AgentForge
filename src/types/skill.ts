/**
 * AgentLemon skill contract (P3-8). Specification: docs/SKILLS.md.
 *
 * A skill is the second kind of item beside agents: a folder with one
 * SKILL.md instruction file, optional text reference files, and (in private
 * skills only) scripts. Like the agent contract, field names are snake_case
 * because records are serialized as-is to Firestore, public files, and MCP
 * payloads. Agent identity and visibility come from src/types/agent.ts so the
 * two kinds cannot drift.
 */
import type { AgentAuthor, AgentManifest, AgentRecord } from './agent'

/** Bumped only for a breaking change. Public readers ignore unknown fields. */
export const SKILL_SCHEMA_VERSION = 1

export type SkillVisibility = AgentManifest['visibility']

export type SkillReviewStatus = AgentRecord['review_status']

/**
 * What a file is, derived from its path and first line (docs/SKILLS.md 3).
 * The stored value must equal the derived one; readers re-derive and reject
 * a mismatch, so a client cannot relabel a script as reference.
 */
export type SkillFileKind = 'instructions' | 'reference' | 'script'

export interface SkillFile {
  /** Relative POSIX path inside the skill folder, e.g. `references/api.md`. */
  path: string
  kind: SkillFileKind
  /** The file's full text, verbatim, as decoded UTF-8. Never binary. */
  content: string
}

export interface SkillStats {
  /** ISO 8601 timestamp. */
  updated_at: string
  /** Vote counts (P3-13). Absent means zero. Only votes change them. */
  thumbs_up?: number
  thumbs_down?: number
}

export interface SkillManifest {
  skill_schema_version: typeof SKILL_SCHEMA_VERSION
  visibility: SkillVisibility
  /** Unique slug among skills. Doubles as the Firestore document id. */
  id: string
  /** Semver. */
  version: string
  /** Equal to the `name` in SKILL.md frontmatter. */
  name: string
  /** Equal to the `description` in SKILL.md frontmatter. */
  description: string
  author: AgentAuthor
  /** Lowercase discovery tags, as for agents. */
  tags: string[]
  /** Exactly one `instructions` file, at path `SKILL.md`. */
  files: SkillFile[]
  stats: SkillStats
  origin_app?: 'claude' | 'chatgpt' | 'other'
}

/** Firestore document metadata. Never serialized into a public file. */
export interface SkillRecord extends SkillManifest {
  owner_uid: string
  review_status: SkillReviewStatus
  saved_from_chat?: true
}

/** One file as listed in the public index: no content. */
export interface SkillFileSummary {
  path: string
  kind: SkillFileKind
  /** UTF-8 byte length of the content. */
  bytes: number
}

/** One entry of `public/skills.json`. Content lives in the version file. */
export interface SkillIndexEntry extends Omit<SkillManifest, 'files'> {
  files: SkillFileSummary[]
}

/** `public/skills.json`. A wrapper object, unlike `catalog.json`. */
export interface SkillIndex {
  skill_schema_version: typeof SKILL_SCHEMA_VERSION
  skills: SkillIndexEntry[]
}

/* ---------- Item references, shared with councils (P3-14) ---------- */

/** Every kind of item a reference can point at. Councils may add 'council'. */
export type ItemKind = 'agent' | 'skill'

/**
 * A pinned pointer to one exact version of one item.
 * String form: `<kind>:<id>@<version>`, e.g. `skill:pdf-forms@1.2.0`.
 */
export interface ItemRef {
  kind: ItemKind
  id: string
  version: string
}
