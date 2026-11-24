import {
  createElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Fades its children up 20px the first time they scroll into view.
 *
 * The hidden state only exists once this has added `reveal-ready` to <html>,
 * which it does only when IntersectionObserver exists and the visitor has not
 * asked for reduced motion. Without either, content is simply visible.
 */
let observer: IntersectionObserver | null = null
// Each element's "now visible" callback. The visible state lives in React, so
// a re-render that changes className cannot drop it (it used to be only a
// class added by hand, which React overwrote, hiding the content for good).
const onVisible = new WeakMap<Element, () => void>()

function getObserver(): IntersectionObserver | null {
  if (observer) return observer
  if (typeof IntersectionObserver === 'undefined') return null
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return null
  document.documentElement.classList.add('reveal-ready')
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        onVisible.get(entry.target)?.()
        observer?.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  )
  return observer
}

interface RevealProps {
  as?: 'div' | 'section' | 'li' | 'p'
  id?: string
  className?: string
  /** Milliseconds to wait before the fade starts, to stagger a row of cards. */
  delay?: number
  children?: ReactNode
}

export function Reveal({
  as = 'div',
  id,
  className,
  delay = 0,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    const io = getObserver()
    if (!element || !io) return
    onVisible.set(element, () => setVisible(true))
    io.observe(element)
    return () => {
      io.unobserve(element)
      onVisible.delete(element)
    }
  }, [])

  const classes = ['reveal', visible && 'is-visible', className]
    .filter(Boolean)
    .join(' ')

  return createElement(
    as,
    {
      ref,
      id,
      className: classes,
      style: delay ? { transitionDelay: `${delay}ms` } : undefined,
    },
    children,
  )
}
