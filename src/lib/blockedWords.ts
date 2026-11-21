import rawBlockedWords from '../../public/blocked-words.json'

export const HARD_CORE_BLOCKED_WORDS = [
  'word1',
  'badword',
  'spamword',
  'hateword',
  'slurword',
  'hardcoreword',
] as const

let cachedWords: string[] | null = null

export function getBlockedWordsSync(): string[] {
  if (!cachedWords) {
    cachedWords = Array.isArray(rawBlockedWords)
      ? (rawBlockedWords as string[]).map((w) => w.toLowerCase())
      : [...HARD_CORE_BLOCKED_WORDS]
  }
  return cachedWords
}

export async function fetchBlockedWords(): Promise<string[]> {
  if (cachedWords) return cachedWords
  if (typeof fetch === 'function') {
    try {
      const response = await fetch('/blocked-words.json')
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data)) {
          cachedWords = data.map((w: unknown) => String(w).toLowerCase())
          return cachedWords
        }
      }
    } catch {
      // Fallback to bundled words on fetch failure
    }
  }
  return getBlockedWordsSync()
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Checks whether the text contains any blocked word matching whole words only.
 * Case-insensitive. Word boundary match ensures innocent words containing
 * a blocked word substring (e.g. "password1", "sword1") are accepted.
 *
 * Returns true if clean (no blocked words), false if a blocked word is found.
 */
export function noBlockedWordsClient(
  text: string,
  words: readonly string[] = getBlockedWordsSync(),
): boolean {
  if (!text || !words || words.length === 0) return true
  for (const word of words) {
    if (!word) continue
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i')
    if (regex.test(text)) {
      return false
    }
  }
  return true
}

export function hasBlockedWord(
  text: string,
  words: readonly string[] = getBlockedWordsSync(),
): boolean {
  return !noBlockedWordsClient(text, words)
}

export type ItemKind = 'agent' | 'skill'

export interface RatingComment {
  id: string
  author_handle: string
  body: string
  created_at: string
}

export interface RatingData {
  kind: ItemKind
  id: string
  thumbs_up: number
  thumbs_down: number
  comments: RatingComment[]
}

/**
 * Fetches static ratings and comments from Hosting (0 Firestore reads).
 */
export async function fetchRatings(
  kind: ItemKind,
  itemId: string,
): Promise<RatingData> {
  try {
    const res = await fetch(`/ratings/${kind}/${itemId}.json`)
    if (res.ok) {
      const data = await res.json()
      return {
        kind,
        id: itemId,
        thumbs_up: typeof data.thumbs_up === 'number' ? data.thumbs_up : 0,
        thumbs_down:
          typeof data.thumbs_down === 'number' ? data.thumbs_down : 0,
        comments: Array.isArray(data.comments) ? data.comments : [],
      }
    }
  } catch {
    // Return empty fallback on network error or missing file
  }
  return {
    kind,
    id: itemId,
    thumbs_up: 0,
    thumbs_down: 0,
    comments: [],
  }
}
