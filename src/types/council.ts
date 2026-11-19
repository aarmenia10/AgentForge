/**
 * AgentLemon council contract (P3-14). Specification: docs/COUNCILS.md.
 *
 * A council bundles agents and skills that collaborate on a task, each pinned
 * to an exact version, plus the coordination instructions for how they work
 * together (roles, order, handoffs). Like agents and skills, field names are
 * snake_case because records are serialized as-is to Firestore, public files,
 * and MCP payloads. Agent identity and visibility come from src/types/agent.ts,
 * and item references come from src/types/skill.ts.
 */
import type { AgentAuthor, AgentManifest, AgentRecord } from './agent'
import type { ItemRef } from './skill'

/** Bumped only for a breaking change. Public readers ignore unknown fields. */
export const COUNCIL_SCHEMA_VERSION = 1

export type CouncilVisibility = AgentManifest['visibility']

export type CouncilReviewStatus = AgentRecord['review_status']

/**
 * One member of a council: an agent or skill pinned to an exact version,
 * assigned a functional role and execution order.
 */
export interface CouncilMember {
  /** Pinned pointer to an exact agent or skill version: kind:id@version. */
  ref: ItemRef
  /** Functional role in this council, e.g. "Lead Architect", "Security Auditor". */
  role: string
  /**
   * Execution stage or sequence (1-based positive integer). Members sharing
   * the same order run in parallel or simultaneously; members with higher
   * order run in subsequent stages receiving handoffs from earlier stages.
   */
  order: number
}

export interface CouncilStats {
  /** ISO 8601 timestamp. Vote counts arrive with P3-13. */
  updated_at: string
}

/**
 * Public manifest of a council. Serialized to public/councils/<id>/<version>.json.
 */
export interface CouncilManifest {
  council_schema_version: typeof COUNCIL_SCHEMA_VERSION
  visibility: CouncilVisibility
  /** Unique slug among councils. Doubles as the Firestore document id. */
  id: string
  /** Semver. */
  version: string
  name: string
  description: string
  author: AgentAuthor
  /** Lowercase discovery tags, 1 to 10. */
  tags: string[]
  /**
   * The AI application this council was exported or saved from, if known
   * (e.g. "claude", "chatgpt", "codex", "antigravity"). Portability metadata.
   */
  origin_app?: string
  /**
   * Coordination instructions: how members work together, step-by-step
   * pipeline, roles, handoff conventions, and synthesis protocols.
   */
  instructions: string
  /** Pinned member agents and skills (2 to 20 members). */
  members: CouncilMember[]
  stats: CouncilStats
}

/** Firestore document metadata. Never serialized into a public file. */
export interface CouncilRecord extends CouncilManifest {
  owner_uid: string
  review_status: CouncilReviewStatus
  /** True when created via the connector's save_council from a chat. */
  saved_from_chat?: boolean
}

/**
 * One entry of public/councils.json. Full instructions are omitted so the
 * public index stays small enough to browse with zero Firestore reads.
 */
export interface CouncilIndexEntry extends Omit<
  CouncilManifest,
  'instructions'
> {
  /** Length of instructions in UTF-8 bytes. */
  instructions_bytes: number
  /** Total number of members in this council. */
  member_count: number
}

/** public/councils.json. A wrapper object, unlike catalog.json. */
export interface CouncilIndex {
  council_schema_version: typeof COUNCIL_SCHEMA_VERSION
  councils: CouncilIndexEntry[]
}

/**
 * Extended member descriptor returned by get_council when resolving
 * member details for an AI to run or pick members.
 */
export interface ResolvedCouncilMember extends CouncilMember {
  name?: string
  description?: string
  /** Member instructions or prompt blueprint summary, if available. */
  instructions?: string
  available?: boolean
  error?: string
}

/** Result shape returned by get_council over the connector. */
export interface GetCouncilResult {
  /** Formatted item reference string: council:<id>@<version>. */
  ref: string
  name: string
  description: string
  author: AgentAuthor
  notice: string
  instructions: string
  members: CouncilMember[]
  resolved_members?: ResolvedCouncilMember[]
}
