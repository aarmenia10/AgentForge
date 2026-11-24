import { useEffect, useState } from 'react'
import { Hero } from '@/components/Hero'
import { agentRepository } from '@/lib/agentRepository'

// Kept for the session so returning to the home page shows the count at once.
let cachedCount: number | null = null

/**
 * The landing page: the hero and its three ways in (Agents, Skills, Councils).
 * The agent catalog lives at `/agents`. The only data read here is the agent
 * count, from the static `catalog.json` (invariant 3).
 */
export function HomePage() {
  const [agentCount, setAgentCount] = useState(cachedCount ?? 0)

  useEffect(() => {
    let cancelled = false
    agentRepository
      .listAgents()
      .then((list) => {
        cachedCount = list.length
        if (!cancelled) setAgentCount(list.length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex-1">
      <Hero agentCount={agentCount} />
    </main>
  )
}
