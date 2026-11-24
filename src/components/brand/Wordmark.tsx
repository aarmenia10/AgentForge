import { cn } from '../ui'

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn('text-lg font-bold text-fg', className)}
      style={{ fontFamily: '"Chakra Petch", "Inter Tight", sans-serif' }}
    >
      Agent<span className="text-accent-fg">Lemon</span>
    </span>
  )
}
