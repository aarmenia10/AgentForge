import {
  Bot,
  Building2,
  Clock,
  DollarSign,
  ListChecks,
  Share2,
  TrendingUp,
} from 'lucide-react'
import RequestDemo from '@/components/RequestDemo'
import { Link } from '@/router/Router'

const primary =
  'inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink hover:opacity-90'
const secondary =
  'inline-flex items-center justify-center rounded-full border border-line px-5 py-3 text-sm font-semibold text-fg hover:bg-surface-2'

const introduction =
  'AgentLemon was created to make artificial intelligence accessible to everyone. Our platform makes it easy to discover, share, and download AI agents, skills, and councils that help individuals and businesses work smarter.'
const comparison =
  'An AI agent is your digital assistant. An AI skill teaches it a task. An AI council is a team of agents and skills that work together.'
const enterprise =
  'AgentForce Enterprise gives companies a private space to upload, organize, and share AI agents and skills with their employees. Instead of every employee creating their own AI tools from scratch, teams can collaborate and reuse tools internally.'

const examples = [
  {
    title: 'What is an AI agent?',
    icon: Bot,
    description:
      'An AI agent is like a digital assistant that helps you complete tasks. You give it a goal, and it helps you accomplish that goal.',
    items: [
      'Researching potential customers',
      'Analyzing financial information',
      'Writing emails and reports',
      'Organizing company documents',
      'Assisting with customer service',
    ],
    link: '/',
    label: 'Explore agents',
  },
  {
    title: 'What is an AI skill?',
    icon: ListChecks,
    description:
      'An AI skill is a set of instructions that teaches your AI assistant how to perform a specific task.',
    items: [
      'Creating professional presentations',
      'Building financial models',
      'Summarizing documents',
      'Formatting spreadsheets',
      'Writing marketing content',
    ],
    link: '/skills',
    label: 'Explore skills',
  },
]

const benefits = [
  {
    title: 'Save Time',
    icon: Clock,
    description: 'Spend less time completing repetitive tasks.',
  },
  {
    title: 'Reduce Costs',
    icon: DollarSign,
    description: 'Reduce the amount of manual work required.',
  },
  {
    title: 'Increase Productivity',
    icon: TrendingUp,
    description:
      'Give employees more time to focus on important responsibilities.',
  },
  {
    title: 'Improve Consistency',
    icon: ListChecks,
    description: 'Help employees follow standardized processes.',
  },
  {
    title: 'Share Knowledge',
    icon: Share2,
    description: 'Make useful AI tools available across your organization.',
  },
]

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-12 px-4 py-12 sm:px-6 sm:py-16">
      <section className="glass rounded-3xl p-6 sm:p-12">
        <p className="text-sm font-semibold text-accent-fg">About AgentLemon</p>
        <h1 className="mt-3 max-w-3xl text-3xl sm:text-5xl">
          AI made simple for everyone.
        </h1>
        <h2 className="mt-6 text-xl">Who we are</h2>
        <p className="mt-3 max-w-3xl text-lg leading-relaxed text-fg-muted">
          {introduction}
        </p>
        <p className="mt-3 text-lg">
          You don't need to be a programmer or an AI expert to get started.
        </p>
      </section>

      <section aria-label="Agents and skills" className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          {examples.map((example) => (
            <article
              key={example.title}
              className="glass rounded-3xl p-6 sm:p-8"
            >
              <example.icon
                aria-hidden="true"
                className="size-9 text-accent-fg"
              />
              <h2 className="mt-4 text-2xl">{example.title}</h2>
              <p className="mt-3 leading-relaxed text-fg-muted">
                {example.description}
              </p>
              <ul className="my-6 list-disc space-y-2 pl-5 text-fg-muted">
                {example.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link to={example.link} className={secondary}>
                {example.label}
              </Link>
            </article>
          ))}
        </div>
        <p className="rounded-2xl bg-surface-2 p-5 text-center font-semibold">
          {comparison}
        </p>
      </section>

      <section aria-labelledby="business-benefits">
        <h2 id="business-benefits" className="mb-5 text-2xl sm:text-3xl">
          How can AI benefit your company?
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <article key={benefit.title} className="glass rounded-2xl p-6">
              <benefit.icon
                aria-hidden="true"
                className="size-7 text-accent-fg"
              />
              <h3 className="mt-4 text-xl">{benefit.title}</h3>
              <p className="mt-2 text-fg-muted">{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-3xl p-6 sm:p-10">
        <Building2 aria-hidden="true" className="size-9 text-accent-fg" />
        <h2 className="mt-4 text-2xl sm:text-3xl">AgentForce Enterprise</h2>
        <p className="mt-3 max-w-3xl leading-relaxed text-fg-muted">
          {enterprise}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/enterprise" className={primary}>
            Explore Enterprise
          </Link>
          <RequestDemo triggerClassName={secondary} />
        </div>
      </section>
    </main>
  )
}
