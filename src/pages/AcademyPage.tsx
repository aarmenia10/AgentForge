import { Check, Clock3 } from 'lucide-react'
import { useState } from 'react'
import {
  ACADEMY_PROMISE,
  ACADEMY_STEPS,
  ACADEMY_TAGLINE,
  ACADEMY_TITLE,
  academyMinutes,
  academyTutorPrompt,
} from '@/lib/academy'
import { readAcademyDone, writeAcademyDone } from '@/lib/academyProgress'
import { useAuth } from '@/auth/AuthProvider'
import { CodeBlock, primaryButtonClass, ArrowIcon } from '@/components/ui'
import { Link } from '@/router/Router'

const academyActionClass = `${primaryButtonClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lm-accent-text)]`

export default function AcademyPage() {
  const { status, openSignIn } = useAuth()
  const stepIds = ACADEMY_STEPS.map((step) => step.id)
  const [doneIds, setDoneIds] = useState(() =>
    readAcademyDone().filter((id) => stepIds.includes(id)),
  )
  const doneCount = doneIds.length
  const allDone = stepIds.length > 0 && doneCount === stepIds.length
  const progress = stepIds.length ? (doneCount / stepIds.length) * 100 : 0

  function setStepDone(id: string, done: boolean) {
    const next = done
      ? [...new Set([...doneIds, id])]
      : doneIds.filter((doneId) => doneId !== id)
    setDoneIds(next)
    writeAcademyDone(next)
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-10 px-4 pb-14 pt-8 sm:space-y-12 sm:px-6 sm:pt-12">
      <section
        aria-labelledby="academy-title"
        className="mx-auto max-w-4xl text-center"
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent-fg">
          {ACADEMY_TITLE}
        </p>
        <h1
          id="academy-title"
          className="mx-auto mt-6 max-w-4xl text-balance text-[36px] font-semibold leading-[1.2] tracking-[-0.03em] sm:text-[52px] lg:text-[68px]"
        >
          AI made <span className="text-accent-fg">simple.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-fg-muted sm:text-lg">
          {ACADEMY_TAGLINE}
        </p>
        <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-medium text-fg">
          <Clock3 className="size-4 text-accent-fg" aria-hidden="true" />
          {academyMinutes()} minutes
        </p>
        <ul className="mx-auto mt-6 max-w-2xl space-y-3 text-left">
          {ACADEMY_PROMISE.map((promise) => (
            <li
              key={promise}
              className="flex items-start gap-3 text-sm leading-relaxed text-fg-muted sm:text-base"
            >
              <Check
                className="mt-0.5 size-5 shrink-0 text-accent-fg"
                aria-hidden="true"
              />
              <span>{promise}</span>
            </li>
          ))}
        </ul>
        {status === 'signed-out' && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-sm text-fg-muted">
            <p>
              You&apos;ll need a free AgentLemon account to save your own agents
              and skills
            </p>
            <button
              type="button"
              className={`${academyActionClass} h-10 px-5`}
              onClick={() =>
                openSignIn({
                  reason:
                    'Sign in to save your own agents and skills on AgentLemon.',
                })
              }
            >
              Sign in
              <ArrowIcon />
            </button>
          </div>
        )}
      </section>

      <section
        aria-labelledby="academy-start"
        className="rounded-[2rem] bg-surface p-5 sm:p-8"
      >
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-fg">
            Start here
          </p>
          <h2 id="academy-start" className="mt-2 text-2xl font-semibold">
            Let your AI guide you
          </h2>
          <div className="mt-5">
            <CodeBlock
              code={academyTutorPrompt()}
              title="Copy this into your AI chat"
              emphasizeTitle
              wrap
            />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">
            Paste it into ChatGPT, Claude, or the AI you use. It will walk you
            through everything below.
          </p>
        </div>
      </section>

      <section aria-labelledby="academy-steps" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-fg">
              Your course
            </p>
            <h2 id="academy-steps" className="mt-2 text-2xl font-semibold">
              Take it one step at a time
            </h2>
          </div>
          <p className="text-sm font-medium text-fg-muted">
            {doneCount} of {stepIds.length} done
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Academy progress"
          aria-valuemin={0}
          aria-valuemax={stepIds.length}
          aria-valuenow={doneCount}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="space-y-4">
          {ACADEMY_STEPS.map((step, index) => {
            const done = doneIds.includes(step.id)
            return (
              <article
                key={step.id}
                className="rounded-3xl bg-surface p-5 sm:p-7"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-4">
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent-fg"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold sm:text-xl">
                        {step.title}
                      </h3>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-fg-muted">
                        <Clock3 className="size-4" aria-hidden="true" />
                        {step.minutes} minutes
                      </p>
                    </div>
                  </div>
                  <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium text-fg hover:bg-surface-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--lm-accent-text)]">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(event) =>
                        setStepDone(step.id, event.currentTarget.checked)
                      }
                      className="size-4 accent-accent"
                    />
                    Mark done
                  </label>
                </div>
                <div className="mt-5 space-y-3 text-sm leading-relaxed text-fg-muted sm:text-base">
                  {step.body.map((paragraph, paragraphIndex) => (
                    <p key={`${step.id}-${paragraphIndex}`}>{paragraph}</p>
                  ))}
                </div>
                {step.copy && (
                  <div className="mt-5">
                    <CodeBlock
                      code={step.copy.text}
                      title={step.copy.label}
                      emphasizeTitle
                      wrap
                    />
                  </div>
                )}
                {step.link && (
                  <Link
                    to={step.link.to}
                    className={`${academyActionClass} mt-5`}
                  >
                    {step.link.label}
                    <ArrowIcon />
                  </Link>
                )}
              </article>
            )
          })}
        </div>
        {allDone && (
          <div
            role="status"
            className="rounded-[2rem] bg-accent/10 p-6 text-center sm:p-8"
          >
            <h3 className="text-xl font-semibold">You finished the Academy</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Your next step is to explore what you can make.
            </p>
            <Link to="/suggestions" className={`${academyActionClass} mt-5`}>
              See your suggestions
              <ArrowIcon />
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
