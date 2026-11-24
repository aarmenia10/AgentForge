import { useEffect, useRef } from 'react'
import type { HomeItem } from '@/lib/homeFeed'
import type { AtomPalette } from '@/theme/atomPalette'
import { createAtom, type AtomController } from './atomScene'

interface AtomCanvasProps {
  /** Agents and skills in turn: every electron is a real catalog item. */
  items: HomeItem[]
  palette: AtomPalette
  /** `kind:id` (or `council`) of the keyboard link that has focus, if any. */
  activeKey: string | null
  onOpen: (to: string) => void
  /** WebGL failed. The hero drops the atom (or, with `?atomdebug`, reports). */
  onUnavailable: (reason: string) => void
  onInfo?: (lines: string[]) => void
}

/**
 * The interactive 3D atom. Default export so `React.lazy` can load it: this
 * file and `atomScene.ts` (three.js) are the added chunk.
 *
 * The canvas takes horizontal drags only on touch (`touch-action: pan-y`), so
 * a vertical swipe still scrolls the page. There is no zoom and no pan. The
 * nucleus is "Council": hovering it shows that label, clicking it opens
 * `/councils`.
 */
export default function AtomCanvas({
  items,
  palette,
  activeKey,
  onOpen,
  onUnavailable,
  onInfo,
}: AtomCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const controller = useRef<AtomController | null>(null)
  // Latest values for the long-lived scene, without rebuilding it.
  const latest = useRef({ palette, activeKey, onOpen, onUnavailable, onInfo })
  latest.current = { palette, activeKey, onOpen, onUnavailable, onInfo }

  useEffect(() => {
    if (!host.current || !label.current) return
    // A fresh canvas per scene: dispose() forces the WebGL context lost, and a
    // canvas keeps its lost context, so reusing one (React's development
    // double mount, or a new item list) would leave the second scene blank.
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.className =
      'absolute inset-0 size-full cursor-grab touch-pan-y select-none'
    host.current.append(canvas)
    try {
      controller.current = createAtom({
        canvas,
        label: label.current,
        items,
        palette: latest.current.palette,
        onOpen: (to) => latest.current.onOpen(to),
        onLost: (reason) => latest.current.onUnavailable(reason),
        onInfo: (lines) => latest.current.onInfo?.(lines),
      })
      controller.current.setActive(latest.current.activeKey)
    } catch (err) {
      latest.current.onUnavailable(
        `setup failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    return () => {
      controller.current?.dispose()
      controller.current = null
      canvas.remove()
    }
  }, [items])

  useEffect(() => controller.current?.setPalette(palette), [palette])
  useEffect(() => controller.current?.setActive(activeKey), [activeKey])

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <span
        ref={label}
        aria-hidden="true"
        className="pointer-events-none absolute z-10 max-w-[80%] -translate-x-1/2 -translate-y-[170%] truncate rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg opacity-0 shadow-[var(--lm-shadow)] transition-opacity duration-150"
      />
    </>
  )
}
