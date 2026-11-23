import { createElement, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * Fades its children up 20px the first time they scroll into view.
 *
 * The hidden state only exists once this has added `reveal-ready` to <html>,
 * which it does only when IntersectionObserver exists and the visitor has not
 * asked for reduced motion. Without either, content is simply visible.
 */
let observer: IntersectionObserver | null = null

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
        entry.target.classList.add('is-visible')
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

  useLayoutEffect(() => {
    const element = ref.current
    const io = getObserver()
    if (!element || !io) return
    io.observe(element)
    return () => io.unobserve(element)
  }, [])

  return createElement(
    as,
    {
      ref,
      id,
      className: className ? `reveal ${className}` : 'reveal',
      style: delay ? { transitionDelay: `${delay}ms` } : undefined,
    },
    children,
  )
}
