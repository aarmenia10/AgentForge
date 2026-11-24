import { useEffect, useRef } from 'react'
import type { HomeItem } from '@/lib/homeFeed'
import { toHex } from '@/theme/appearance'
import type { AtomPalette } from '@/theme/atomPalette'
import { createAtom, type AtomController } from './atomScene'

interface AtomCanvasProps {
  /** Agents and skills in turn: every electron is a real catalog item. */
  items: HomeItem[]
  palette: AtomPalette
  /** `kind:id` of the electron whose keyboard link has focus, if any. */
  activeKey: string | null
  onOpen: (to: string) => void
  /** WebGL is missing or was lost. The caller shows the static atom. */
  onUnavailable: () => void
}

/**
 * The interactive 3D atom. Default export so `React.lazy` can load it: this
 * file and `atomScene.ts` (three.js) are the added chunk.
 *
 * The canvas takes horizontal drags only on touch (`touch-action: pan-y`), so
 * a vertical swipe still scrolls the page. There is no zoom and no pan.
 */
export default function AtomCanvas({
  items,
  palette,
  activeKey,
  onOpen,
  onUnavailable,
}: AtomCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const controller = useRef<AtomController | null>(null)
  // Latest values for the long-lived scene, without rebuilding it.
  const latest = useRef({ palette, activeKey, onOpen, onUnavailable })
  latest.current = { palette, activeKey, onOpen, onUnavailable }

  useEffect(() => {
    if (!canvas.current || !label.current) return
    try {
      controller.current = createAtom({
        canvas: canvas.current,
        label: label.current,
        items,
        palette: latest.current.palette,
        onOpen: (to) => latest.current.onOpen(to),
        onLost: () => latest.current.onUnavailable(),
      })
      controller.current.setActive(latest.current.activeKey)
    } catch {
      latest.current.onUnavailable()
    }
    return () => {
      controller.current?.dispose()
      controller.current = null
    }
  }, [items])

  useEffect(() => controller.current?.setPalette(palette), [palette])
  useEffect(() => controller.current?.setActive(activeKey), [activeKey])

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="absolute inset-0 size-full cursor-grab touch-pan-y select-none"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-semibold tracking-tight"
        style={{
          color: toHex(palette.accentInk),
          fontSize: 'clamp(12px, 3.6cqw, 18px)',
        }}
      >
        Council
      </span>
      <span
        ref={label}
        aria-hidden="true"
        className="pointer-events-none absolute z-10 max-w-[80%] -translate-x-1/2 -translate-y-[170%] truncate rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg opacity-0 shadow-[var(--lm-shadow)] transition-opacity duration-150"
      />
    </>
  )
}
