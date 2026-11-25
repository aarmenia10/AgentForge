/**
 * Self-containment checks for exported items (brief prompts/export-fix-worker.md, W3).
 *
 * An item saved from one chat is later loaded by a fresh AI, often in another
 * app, with nothing but the item's own text. These checks look for text that
 * only made sense in the chat or project it came from: files that are not in
 * the bundle, "this project" phrasing, places without a URL, one app's tool
 * IDs, other skills, unfilled placeholders, councils with no handoffs, and
 * agent inputs the prompts never use.
 *
 * They only warn (owner decision D2, 2026-11-25): no save is ever blocked.
 * Warnings are computed at save or read time and returned in tool responses;
 * they are never stored. Low false positives are preferred over coverage.
 *
 * Imported by the site, the local server, and the connector's Worker, so it
 * must stay free of Node APIs, Ajv, and eval.
 */

export type SelfContainedCode =
  | 'absent_file'
  | 'hidden_context'
  | 'vague_location'
  | 'tool_id'
  | 'skill_reference'
  | 'placeholder'
  | 'council_short_instructions'
  | 'council_no_handoff'
  | 'unused_input'

export interface SelfContainedWarning {
  code: SelfContainedCode
  message: string
  /** The text that triggered the warning, exactly as written. */
  match: string
  /** Where it was found: a skill file path or an item field. */
  where: string
}

export type SelfContainedKind = 'agent' | 'skill' | 'council'

/** At most this many warnings per item, so a response stays readable. */
export const MAX_SELF_CONTAINED_WARNINGS = 30
/** Council instructions shorter than this rarely say who hands what to whom. */
export const COUNCIL_MIN_INSTRUCTIONS = 200

type Source = { where: string; text: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown) => (typeof value === 'string' ? value : '')
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []

/** Guesses an item's kind from its shape, or null when it is not an item. */
export function inferItemKind(item: unknown): SelfContainedKind | null {
  if (!isRecord(item)) return null
  if (isRecord(item.prompt_blueprint)) return 'agent'
  if (Array.isArray(item.files)) return 'skill'
  if (Array.isArray(item.members) && typeof item.instructions === 'string')
    return 'council'
  return null
}

/* ---------- Patterns ---------- */

/** File extensions worth flagging. Code extensions that double as library names (.js, .ts) are left out. */
const FILE_EXTENSIONS =
  'docx|doc|pdf|md|markdown|csv|tsv|txt|json|jsonl|yaml|yml|xlsx|xls|pptx|ppt|png|jpe?g|gif|svg|webp|zip|html?|xml|py|ipynb|sh|rtf|odt|ods|odp|epub'
/**
 * Matches only the extension. The name is collected by walking backwards a
 * bounded distance, because a pattern like `[\w.-]*\.md` backtracks
 * quadratically over a long run of name characters (a 200 KiB save would
 * exhaust the Worker's CPU budget).
 */
const FILE_EXTENSION = new RegExp(
  `\\.(?:${FILE_EXTENSIONS})(?![A-Za-z0-9_])`,
  'gi',
)
const NAME_CHAR = /[A-Za-z0-9_.\-/\\]/
/** Longer than any skill path (160), so a real name is never cut short. */
const MAX_NAME_LENGTH = 200
/** How far tokenAround looks for whitespace on each side. */
const MAX_TOKEN_REACH = 300
/**
 * Text just before a file name that says the item creates the file
 * ("save the result as", "name the output file"). Applied to at most 80
 * characters, so it cannot backtrack far.
 */
const OUTPUT_NAME =
  /(?:\b(?:save|saved|saving|export|exported|exporting|write|written|writing|name|call)\b(?: (?:it|this|that|them|each|the|your|a|an|final|output|result|results|file|files|document|doc|report|compiled))*(?: (?:as|to|is))?|\b(?:file ?name|output file)(?: is)?)[\s:`"'(*]*$/i
/** The item tells the AI to get the address from the user. */
const URL_FROM_USER =
  /\bask(?:s|ing)? (?:the user|them|for)\b[^.\n]{0,60}\b(?:URL|web address|link|address)\b|\b(?:URL|link|address) (?:the user|they) (?:gives?|provides?|pastes?|shares?|sends?)\b/i
const URL_PATTERN = /\bhttps?:\/\/[^\s)>\]]+|\bwww\.[^\s)>\]]+/i
const LOCAL_PATH =
  /(?:^|[\s(`'"])((?:[A-Za-z]:\\|\/Users\/|\/home\/|~\/)[^\s`'")]*)/g

const HIDDEN_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bthis (?:project|project folder|workspace)\b/gi,
  /\bthe project(?:'s|’s)? (?:folder|files|knowledge|docs|documents)\b/gi,
  /\bour (?:project|previous (?:chat|conversation)|earlier (?:chat|conversation))\b/gi,
  /\b(?:the |an? )?attached (?:files?|documents?|docs?|pdfs?|spreadsheets?|sheets?|images?|screenshots?|folders?|templates?|examples?)\b/gi,
  /\bthe attachments?\b/gi,
  /\balready (?:in|uploaded to|saved in|added to) (?:this|the|our|your) (?:project|chat|conversation|folder|workspace)\b/gi,
  /\bthe (?:doc|document|file|files|example|template|list|table) above\b/gi,
  /\b(?:as|like) we (?:did|discussed|agreed|built|made|set up)\b/gi,
  /\bwe built\b/gi,
  /\bearlier in (?:this|the|our) (?:chat|conversation|thread|session)\b/gi,
  /\bthe same way (?:this|it) was done\b/gi,
]
/** One pass instead of eleven: every save scans up to 200 KiB on a 9 ms CPU budget. */
const HIDDEN_CONTEXT = new RegExp(
  HIDDEN_CONTEXT_PATTERNS.map(({ source }) => `(?:${source})`).join('|'),
  'gi',
)

const VAGUE_LOCATION: readonly RegExp[] = [
  /\b(?:go|navigate|head|browse) to (?:the |your )?[\w'’-]+(?: [\w'’-]+){0,4} (?:page|site|website|portal|dashboard|tab|screen)\b/gi,
  /\bthe (?:[A-Z][\w'’-]*|course|class|team|company|shared)(?: [\w'’-]+){0,3} (?:page|portal|dashboard)\b/g,
]

/** `claude-in-chrome:navigate`, `claude-in-chrome:*`: the namespace has a hyphen or underscore. */
const NAMESPACED_TOOL =
  /(?<![\w/.:-])([a-z][a-z0-9]*(?:[-_][a-z0-9]+)+):(\*|[a-z][a-z0-9_]*)(?![\w:/-])/g
/** Any `ns:tool` written as code. */
const CODE_NAMESPACED_TOOL = /`([a-z][a-z0-9_-]*):(\*|[a-z][a-z0-9_]*)`/g
const MCP_TOOL = /\bmcp__[a-z0-9_-]+__[a-z0-9_-]+\b/gi
/** Not tools: AgentLemon item references and URI schemes. */
const NOT_TOOL_NAMESPACES = new Set([
  'skill',
  'agent',
  'council',
  'http',
  'https',
  'mailto',
  'tel',
  'data',
  'file',
  'urn',
])
const CODE_SNAKE = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)(?:\(\))?`/g
const TOOL_VERBS = new Set([
  'get',
  'list',
  'search',
  'fetch',
  'read',
  'write',
  'create',
  'update',
  'delete',
  'run',
  'call',
  'ask',
  'send',
  'open',
  'navigate',
  'select',
  'switch',
  'execute',
  'browse',
  'click',
  'find',
  'load',
  'save',
  'upload',
  'download',
  'web',
  'tool',
  'browser',
  'computer',
])
const TOOL_CONTEXT = /\b(?:call|calls|calling|invoke|invokes|tools?)\b/i

const SKILL_REFERENCE =
  /\bthe ([A-Za-z0-9][\w-]*) skill(?:'s|’s|s)?\b(?! (?:references?|refs?|ids?|files?|folders?|versions?|pages?)\b)/gi
const NOT_SKILL_NAMES = new Set([
  'same',
  'right',
  'relevant',
  'new',
  'next',
  'following',
  'previous',
  'chosen',
  'selected',
  'whole',
  'entire',
  'current',
  'original',
  'exported',
  'saved',
  'loaded',
  'other',
  'correct',
  'best',
  'matching',
  'first',
  'last',
  'existing',
  'public',
  'private',
  'shared',
  'this',
  'that',
  'given',
  'named',
  'full',
  'narrowest',
  'pinned',
  'improved',
  'revised',
  'agentlemon',
])

const PLACEHOLDERS: readonly RegExp[] = [
  /<(?:\.\.\.|…)>/g,
  /<[A-Z][A-Z0-9_ -]{1,40}>/g,
  /<(?:your|insert|add|enter|put)\b[^>\n]{0,40}>/gi,
  /\[(?:insert|your|add|enter|todo|tbd|placeholder)\b[^\]\n]{0,40}\]/gi,
  // "mark absent owners as TBD" and quoted "TBD" are values, not gaps.
  /(?<!\bas )(?<!["'`])\b(?:TODO|TBD|FIXME|XXX+)\b(?!["'`])/g,
]

const HANDOFF =
  /\b(?:hand(?:s|ed|ing)?[ -]?(?:off|over)|handoffs?|pass(?:es|ed|ing)?\b[^.\n]{0,40}\b(?:to|on|along)|passes|outputs?|inputs?|deliver(?:s|ed)? [^.\n]{0,40}\bto|sends? [^.\n]{0,40}\bto|receives?|feeds?|returns?|produces?|takes? (?:that|this|these|those|the|its|their)\b)\b/i

/** Words too common in field names to show that a prompt uses the field. */
const GENERIC_WORDS = new Set([
  'the',
  'and',
  'for',
  'data',
  'info',
  'input',
  'inputs',
  'text',
  'value',
  'values',
  'list',
  'item',
  'items',
  'json',
  'string',
  'name',
  'type',
  'id',
])

/* ---------- Messages ---------- */

const MESSAGES = {
  absent_file: (m: string) =>
    `Mentions "${m}", which is not a file in this skill. Bundle it as a reference file. If it is binary (.docx, .pdf, images), save a Markdown format spec plus a short example excerpt instead.`,
  agent_file: (m: string) =>
    `Mentions the file "${m}". An agent carries no files: put the content the AI needs into the instructions, make the file an input the AI must ask the user for, or save this as a skill with reference files.`,
  hidden_context: (m: string) =>
    `"${m}" points at context a fresh AI will not have. Replace it with the actual content, or bundle that content as a reference file.`,
  local_path: (m: string) =>
    `"${m}" is a path on one computer. Bundle the file, or describe what the AI needs from it.`,
  vague_location: (m: string) =>
    `Refers to a place ("${m}") but the item has no URL anywhere. State the URL, or make it an input the AI must ask the user for.`,
  tool_id: (m: string) =>
    `"${m}" is a tool name from one AI app. Describe the step by capability (for example "a browser session that can read the page"); you may name the app, such as "Claude in Chrome", but leave out its tool IDs. Say the minimum capability up front, and give a fallback such as asking the user to paste the page text.`,
  skill_reference: (m: string) =>
    `"${m}" depends on another skill that is not part of this item. Bundle what it needs as reference files, or write the steps here.`,
  placeholder: (m: string) =>
    `"${m}" looks like an unfilled placeholder. Fill it in, or turn it into an input the AI must ask the user for.`,
  council_short_instructions: (m: string) =>
    `Council instructions are only ${m.length} characters. Say what each stage does, what it hands to the next stage, and in what form.`,
  council_no_handoff: () =>
    'Council instructions never say what passes between stages. Name what each stage hands to the next and in what form.',
  unused_input: (m: string) =>
    `Required input "${m}" is never mentioned in the system prompt, instructions, or verification rules. Say how the agent uses it, or drop it from required.`,
}

/* ---------- Text sources ---------- */

function skillSources(item: Record<string, unknown>): Source[] {
  const files = Array.isArray(item.files) ? item.files : []
  return files.flatMap((file) =>
    isRecord(file) &&
    typeof file.path === 'string' &&
    typeof file.content === 'string' &&
    file.kind !== 'script' &&
    !file.content.startsWith('#!')
      ? [{ where: file.path, text: file.content }]
      : [],
  )
}

function agentSources(item: Record<string, unknown>): Source[] {
  const blueprint = isRecord(item.prompt_blueprint) ? item.prompt_blueprint : {}
  const tools = Array.isArray(item.tools_required) ? item.tools_required : []
  return [
    { where: 'description', text: str(item.description) },
    {
      where: 'prompt_blueprint.system_prompt',
      text: str(blueprint.system_prompt),
    },
    ...strings(blueprint.instructions).map((text, i) => ({
      where: `prompt_blueprint.instructions[${i}]`,
      text,
    })),
    ...strings(blueprint.verification_rules).map((text, i) => ({
      where: `prompt_blueprint.verification_rules[${i}]`,
      text,
    })),
    ...tools.map((tool, i) => ({
      where: `tools_required[${i}].description`,
      text: isRecord(tool) ? str(tool.description) : '',
    })),
  ].filter(({ text }) => text.length > 0)
}

function councilSources(item: Record<string, unknown>): Source[] {
  const members = Array.isArray(item.members) ? item.members : []
  return [
    { where: 'description', text: str(item.description) },
    { where: 'instructions', text: str(item.instructions) },
    ...members.map((member, i) => ({
      where: `members[${i}].role`,
      text: isRecord(member) ? str(member.role) : '',
    })),
  ].filter(({ text }) => text.length > 0)
}

/** Names an agent declares itself (tools and schema fields), which are not hidden tool IDs. */
function declaredNames(item: Record<string, unknown>): Set<string> {
  const names = new Set<string>()
  if (Array.isArray(item.tools_required))
    for (const tool of item.tools_required)
      if (isRecord(tool) && typeof tool.name === 'string')
        names.add(tool.name.toLowerCase())
  for (const key of ['input_schema', 'output_schema'])
    collectProperties(item[key], names, 0)
  return names
}

function collectProperties(schema: unknown, names: Set<string>, depth: number) {
  if (!isRecord(schema) || depth > 6) return
  if (isRecord(schema.properties))
    for (const [name, child] of Object.entries(schema.properties)) {
      names.add(name.toLowerCase())
      collectProperties(child, names, depth + 1)
    }
  if (isRecord(schema.items)) collectProperties(schema.items, names, depth + 1)
}

/* ---------- The check ---------- */

/** The whitespace-delimited token around a match, without wrapping punctuation. */
function tokenAround(text: string, start: number, end: number): string {
  let a = start
  let b = end
  const low = Math.max(0, start - MAX_TOKEN_REACH)
  const high = Math.min(text.length, end + MAX_TOKEN_REACH)
  while (a > low && !/\s/.test(text[a - 1])) a--
  while (b < high && !/\s/.test(text[b])) b++
  return text.slice(a, b)
}

/** File names ending in a flagged extension, found in linear time. */
function* fileNames(text: string) {
  for (const found of text.matchAll(FILE_EXTENSION)) {
    const end = found.index + found[0].length
    const floor = Math.max(0, found.index - MAX_NAME_LENGTH)
    let start = found.index
    while (start > floor && NAME_CHAR.test(text[start - 1])) start--
    // The name must start with a letter, digit, or underscore.
    while (start < found.index && !/[A-Za-z0-9_]/.test(text[start])) start++
    if (start === found.index) continue
    yield { index: start, name: text.slice(start, end) }
  }
}

const basename = (path: string) =>
  path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)

export interface SelfContainedOptions {
  /**
   * 'save' (default) runs every check. 'read' skips authoring-only checks
   * that a reader cannot act on: unused agent inputs fire on 13 of the 14
   * approved catalog agents, whose prompts use inputs by meaning ("server
   * version") and receive them as validated JSON, so at read time they would
   * only teach the reading AI to ignore these warnings.
   */
  phase?: 'save' | 'read'
}

/**
 * Returns warnings, never throws, never blocks. `kind` is inferred from the
 * item's shape when omitted; anything that is not an item yields no warnings.
 */
export function checkSelfContained(
  item: unknown,
  kind: SelfContainedKind | null = inferItemKind(item),
  { phase = 'save' }: SelfContainedOptions = {},
): SelfContainedWarning[] {
  if (!isRecord(item) || !kind) return []
  const warnings: SelfContainedWarning[] = []
  const seen = new Set<string>()
  const add = (
    code: SelfContainedCode,
    match: string,
    where: string,
    message: string,
  ) => {
    const key = `${code}\u0000${match.toLowerCase()}`
    if (seen.has(key) || warnings.length >= MAX_SELF_CONTAINED_WARNINGS) return
    seen.add(key)
    warnings.push({ code, message, match, where })
  }
  const full = () => warnings.length >= MAX_SELF_CONTAINED_WARNINGS

  const sources =
    kind === 'skill'
      ? skillSources(item)
      : kind === 'agent'
        ? agentSources(item)
        : councilSources(item)
  const allText = sources.map(({ text }) => text).join('\n')
  const ownNames = new Set(
    [str(item.id), str(item.name)].filter(Boolean).map((v) => v.toLowerCase()),
  )

  // Paths the bundle carries, matched in full or by file name.
  const bundled = new Set<string>()
  if (kind === 'skill' && Array.isArray(item.files))
    for (const file of item.files)
      if (isRecord(file) && typeof file.path === 'string') {
        bundled.add(file.path.toLowerCase())
        bundled.add(basename(file.path).toLowerCase())
      }
  const declared = kind === 'agent' ? declaredNames(item) : new Set<string>()

  const checkedNames = new Set<string>()
  for (const { where, text } of sources) {
    if (full()) break
    // Absent files (skills: not in the bundle; agents: any file name).
    if (kind !== 'council')
      for (const found of fileNames(text)) {
        if (full()) break
        if (checkedNames.has(found.name)) continue
        checkedNames.add(found.name)
        const token = tokenAround(
          text,
          found.index,
          found.index + found.name.length,
        )
        // URLs are remote; patterns ({n}, *, <x>) describe files to create.
        if (/:\/\/|^www\.|[{}*<>]/.test(token)) continue
        const name = found.name
        if (/^[A-Za-z]:\\|^\/|^~\//.test(token.replace(/^[`'"(]+/, '')))
          continue
        if (
          kind === 'skill' &&
          (bundled.has(name.toLowerCase()) ||
            bundled.has(basename(name).toLowerCase()))
        )
          continue
        // A file the item tells the AI to create is not a missing file.
        // Tested last, only for names that would otherwise be flagged.
        if (
          OUTPUT_NAME.test(
            text.slice(Math.max(0, found.index - 80), found.index),
          )
        )
          continue
        add(
          'absent_file',
          name,
          where,
          kind === 'skill'
            ? MESSAGES.absent_file(name)
            : MESSAGES.agent_file(name),
        )
      }

    // Hidden context and local paths.
    for (const found of text.matchAll(HIDDEN_CONTEXT))
      add(
        'hidden_context',
        found[0].trim(),
        where,
        MESSAGES.hidden_context(found[0].trim()),
      )
    if (/:\\|\/Users\/|\/home\/|~\//.test(text))
      for (const found of text.matchAll(LOCAL_PATH))
        add('hidden_context', found[1], where, MESSAGES.local_path(found[1]))

    // Hard-coded tool IDs. The substring checks skip whole passes on text
    // that cannot match, which keeps large saves cheap.
    const namespaced = new Set<string>()
    const toolPatterns = text.includes(':')
      ? text.includes('`')
        ? [NAMESPACED_TOOL, CODE_NAMESPACED_TOOL]
        : [NAMESPACED_TOOL]
      : []
    for (const pattern of toolPatterns)
      for (const found of text.matchAll(pattern)) {
        if (NOT_TOOL_NAMESPACES.has(found[1])) continue
        const id = `${found[1]}:${found[2]}`
        namespaced.add(found[2])
        add('tool_id', id, where, MESSAGES.tool_id(id))
      }
    if (/mcp__/i.test(text))
      for (const found of text.matchAll(MCP_TOOL))
        add('tool_id', found[0], where, MESSAGES.tool_id(found[0]))
    if (text.includes('`'))
      for (const line of text.split('\n')) {
        // Tested once per line: per match it would rescan a long line each time.
        let lineContext: boolean | undefined
        for (const found of line.matchAll(CODE_SNAKE)) {
          if (full()) break
          const id = found[1]
          if (namespaced.has(id) || declared.has(id) || ownNames.has(id))
            continue
          const toolish =
            TOOL_VERBS.has(id.split('_')[0]) ||
            id.includes('tool') ||
            /_v\d+$/.test(id) ||
            (lineContext ??= TOOL_CONTEXT.test(line))
          if (toolish) add('tool_id', id, where, MESSAGES.tool_id(id))
        }
      }

    // Other skills.
    for (const found of text.matchAll(SKILL_REFERENCE)) {
      const name = found[1].toLowerCase()
      if (NOT_SKILL_NAMES.has(name) || ownNames.has(name)) continue
      const match = found[0].replace(/(?:'s|’s)$/, '')
      add('skill_reference', match, where, MESSAGES.skill_reference(match))
    }

    // Unfilled placeholders.
    for (const pattern of PLACEHOLDERS)
      for (const found of text.matchAll(pattern))
        add('placeholder', found[0], where, MESSAGES.placeholder(found[0]))
  }

  // Vague locations: one warning per item, only when no URL appears anywhere
  // and the item does not tell the AI to ask the user for it.
  if (!URL_PATTERN.test(allText))
    outer: for (const { where, text } of sources)
      for (const pattern of VAGUE_LOCATION)
        for (const found of text.matchAll(pattern)) {
          // Scanned only once a vague place is found.
          if (URL_FROM_USER.test(allText)) break outer
          add(
            'vague_location',
            found[0],
            where,
            MESSAGES.vague_location(found[0]),
          )
          break outer
        }

  if (kind === 'council') {
    const instructions = str(item.instructions).trim()
    if (instructions.length < COUNCIL_MIN_INSTRUCTIONS)
      add(
        'council_short_instructions',
        instructions,
        'instructions',
        MESSAGES.council_short_instructions(instructions),
      )
    if (!HANDOFF.test(instructions))
      add(
        'council_no_handoff',
        instructions,
        'instructions',
        MESSAGES.council_no_handoff(),
      )
  }

  if (kind === 'agent' && phase === 'save') {
    const blueprint = isRecord(item.prompt_blueprint)
      ? item.prompt_blueprint
      : {}
    const prompt = [
      str(blueprint.system_prompt),
      ...strings(blueprint.instructions),
      ...strings(blueprint.verification_rules),
    ]
      .join('\n')
      .toLowerCase()
    const schema = isRecord(item.input_schema) ? item.input_schema : {}
    // Used means the field name, or any distinctive word of it, appears in
    // the prompts: "postgres_version" counts as used by "server version".
    const words = new Set(prompt.split(/[^a-z0-9]+/).filter(Boolean))
    for (const name of strings(schema.required)) {
      const parts = name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3 && !GENERIC_WORDS.has(part))
      const used =
        prompt.includes(name.toLowerCase()) ||
        parts.some((part) => words.has(part) || words.has(part + 's'))
      if (!used)
        add(
          'unused_input',
          name,
          'input_schema.required',
          MESSAGES.unused_input(name),
        )
    }
  }

  return warnings
}
