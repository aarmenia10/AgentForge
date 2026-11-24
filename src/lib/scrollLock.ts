type OverflowStyle = Pick<CSSStyleDeclaration, 'overflow'>

const locks = new WeakMap<OverflowStyle, { count: number; overflow: string }>()

/** Keep the page locked until the last overlay closes, in any order. */
export function lockBodyScroll(
  style: OverflowStyle = document.body.style,
): () => void {
  const lock = locks.get(style) ?? { count: 0, overflow: style.overflow }
  if (lock.count === 0) {
    locks.set(style, lock)
    style.overflow = 'hidden'
  }
  lock.count += 1

  let released = false
  return () => {
    if (released) return
    released = true
    lock.count -= 1
    if (lock.count === 0) {
      style.overflow = lock.overflow
      locks.delete(style)
    }
  }
}
