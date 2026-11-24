export const COPY_CONFIRMATION_MS = 3000

/** Confirm only after the browser acknowledges the clipboard write. */
export async function copyText(
  text: string,
  write: (text: string) => Promise<void> = (value) =>
    navigator.clipboard.writeText(value),
): Promise<'copied' | 'error'> {
  try {
    await write(text)
    return 'copied'
  } catch {
    return 'error'
  }
}
