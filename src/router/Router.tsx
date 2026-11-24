import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { matchRoute, routeTitle, type Route } from './routes'

interface Location {
  pathname: string
  search: string
  /**
   * Bumps on every go() and popstate, including ones that change only the
   * query string, so pages that read `window.location` can resync.
   */
  key: number
  restoreY?: number
}

interface RouterContextValue {
  route: Route
  location: Location
  go: (to: string, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)

function readLocation(key: number, restoreY?: number): Location {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    key,
    restoreY,
  }
}

/**
 * A small router on the History API. One context, one popstate listener.
 * When the path changes it scrolls to the top, sets document.title, and moves
 * focus to the new page's h1 (waiting for a lazy page to arrive if needed).
 */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<Location>(() => readLocation(0))

  useEffect(() => {
    const onPopState = () =>
      setLocation((current) =>
        readLocation(current.key + 1, window.history.state?.agentLemonScrollY),
      )
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const go = useCallback((to: string, options: { replace?: boolean } = {}) => {
    const url = new URL(to, window.location.href)
    if (url.origin !== window.location.origin) {
      window.location.assign(url)
      return
    }
    if (url.href !== window.location.href) {
      if (options.replace) window.history.replaceState(null, '', url)
      else {
        window.history.replaceState(
          { ...window.history.state, agentLemonScrollY: window.scrollY },
          '',
        )
        window.history.pushState({ agentLemonCanGoBack: true }, '', url)
      }
    }
    setLocation((current) => readLocation(current.key + 1))
  }, [])

  const route = useMemo(
    () => matchRoute(location.pathname),
    [location.pathname],
  )

  // Per path, not per query string: opening `?agent=<id>` is not a new page.
  const firstPath = useRef(true)
  useLayoutEffect(() => {
    document.title = routeTitle(route)
    if (firstPath.current) {
      firstPath.current = false
      return
    }
    if (location.restoreY !== undefined) return restoreScroll(location.restoreY)
    window.scrollTo(0, 0)
    return focusPageHeading()
    // route derives from pathname, so the path is the only real dependency.
  }, [route])

  const value = useMemo(() => ({ route, location, go }), [route, location, go])
  return <RouterContext value={value}>{children}</RouterContext>
}

/** Return to an in-app browsing page, never to an unknown external page. */
export function closeDetail(go: RouterContextValue['go'], fallback: string) {
  if (window.history.state?.agentLemonCanGoBack) window.history.back()
  else go(fallback, { replace: true })
}

/** Wait for the lazy catalog and its results to regain their previous height. */
function restoreScroll(y: number): () => void {
  const restore = () => {
    window.scrollTo(0, y)
    if (window.scrollY >= y - 1) stop()
  }
  const observer = new ResizeObserver(restore)
  const timer = window.setTimeout(stop, 5000)
  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
  }
  observer.observe(document.body)
  restore()
  return stop
}

/**
 * Focuses the page's h1. A lazy page has no h1 yet on the first frame, so watch
 * the DOM until it arrives. Returns a cleanup that stops watching.
 */
function focusPageHeading(): () => void {
  const tryFocus = () => {
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return false
    if (!heading.hasAttribute('tabindex'))
      heading.setAttribute('tabindex', '-1')
    // The heading is a focus target for screen readers, not a control.
    heading.style.outline = 'none'
    heading.focus({ preventScroll: true })
    return true
  }
  if (tryFocus()) return () => {}
  const observer = new MutationObserver(() => {
    if (tryFocus()) stop()
  })
  const timer = window.setTimeout(() => stop(), 10_000)
  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
  }
  observer.observe(document.body, { childList: true, subtree: true })
  return stop
}

/** The current route, location, and the go() function. */
export function useRoute(): RouterContextValue {
  const context = use(RouterContext)
  if (!context) throw new Error('useRoute must be used inside <RouterProvider>')
  return context
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string
  replace?: boolean
}

/**
 * An `<a href>` that navigates in place on a plain left click. Modified
 * clicks, middle clicks, and links with a target keep browser behaviour.
 */
export function Link({ to, replace, onClick, target, ...rest }: LinkProps) {
  const { go } = useRoute()
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== '_self')
    ) {
      return
    }
    event.preventDefault()
    go(to, { replace })
  }
  return <a href={to} target={target} onClick={handleClick} {...rest} />
}
