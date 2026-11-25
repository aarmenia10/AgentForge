import { lazy, Suspense, useSyncExternalStore } from 'react'

// The drawing and its motion are their own small chunk, so other pages never
// load them and the home page paints its text first.
const LemonPressScene = lazy(() => import('./LemonPressScene'))

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

function subscribe(listener: () => void) {
  const query = window.matchMedia(reducedMotionQuery)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, reducedMotion, () => true)
}

function reducedMotion() {
  return window.matchMedia(reducedMotionQuery).matches
}

/**
 * The home page's still background. It sticks below the top bar for the
 * whole length of the home page, so the hero, Explore, and Trending scroll
 * over it; it ends with the page, so it never covers the footer.
 *
 * Its first child is the scene's box, placed by `.lp-box` in index.css: on
 * the right of the hero on wide screens, under the hero text on phones. A
 * soft fade in the page color keeps the hero text readable where the two meet.
 */
export function HomeBackdrop({ reduced }: { reduced: boolean }) {
  if (reduced) return null
  return (
    // The track spans the whole home page; the backdrop sticks inside it, so
    // it stops where the page ends instead of sliding over the footer.
    <div className="lp-track">
      <div className="lp-backdrop">
        <div className="lp-box">
          <Suspense fallback={null}>
            <LemonPressScene />
          </Suspense>
        </div>
        <div aria-hidden="true" className="lp-fade" />
      </div>
      {/* Where the page ends, the scene fades out instead of stopping in a line. */}
      <div aria-hidden="true" className="lp-end" />
    </div>
  )
}
