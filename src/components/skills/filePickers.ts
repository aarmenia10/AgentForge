/**
 * Turns what the browser hands over (a file input or a drop) into
 * UploadEntry values for readUpload. No new dependency: `webkitdirectory`,
 * `webkitRelativePath`, and `webkitGetAsEntry()` are in every current
 * desktop browser (docs/SKILLS.md section 10).
 */
import { isIgnoredUploadPath } from '@/lib/skillSchema'
import type { UploadEntry } from './skillDraft'

function fromFile(file: File, path: string): UploadEntry {
  return {
    path,
    size: file.size,
    read: async () => new Uint8Array(await file.arrayBuffer()),
  }
}

/** A folder picker reports `folder/sub/file.md`; a file picker only names. */
export function entriesFromFileList(list: FileList | null): UploadEntry[] {
  if (!list) return []
  return Array.from(list, (file) =>
    fromFile(file, file.webkitRelativePath || file.name),
  )
}

/** Stops a dropped folder tree from hanging the page. */
const MAX_DROP_ENTRIES = 500

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readBatch(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) =>
    reader.readEntries(resolve, reject),
  )
}

/**
 * Walks dropped files and folders. readEntries returns at most 100 entries a
 * call, so each folder is read until it returns an empty batch.
 */
export async function entriesFromDrop(
  items: DataTransferItemList,
): Promise<UploadEntry[]> {
  const roots: FileSystemEntry[] = []
  const loose: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry?.()
    if (entry) roots.push(entry)
    else {
      const file = item.getAsFile()
      if (file) loose.push(file)
    }
  }
  const out: UploadEntry[] = loose.map((f) => fromFile(f, f.name))
  const queue = [...roots]
  while (queue.length && out.length <= MAX_DROP_ENTRIES) {
    const entry = queue.shift()!
    const path = entry.fullPath.replace(/^\/+/, '') || entry.name
    if (entry.isFile) {
      out.push(fromFile(await fileOf(entry as FileSystemFileEntry), path))
    } else if (entry.isDirectory && isIgnoredUploadPath(path)) {
      // Listed as skipped without walking it (.git/, node_modules/).
      out.push({
        path: `${path}/`,
        size: 0,
        read: async () => new Uint8Array(),
      })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      for (;;) {
        const batch = await readBatch(reader)
        if (batch.length === 0) break
        queue.push(...batch)
      }
    }
  }
  return out
}
