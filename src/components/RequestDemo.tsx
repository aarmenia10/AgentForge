import { useRef, useState, type FormEvent } from 'react'
import { submitDemoRequest } from '@/services/demoRequests'

const input =
  'w-full rounded-xl border border-slate-300 bg-transparent p-3 dark:border-white/20'
const fields = [
  { name: 'name', label: 'Full name', autoComplete: 'name', maxLength: 100 },
  {
    name: 'position',
    label: 'Job title / position',
    autoComplete: 'organization-title',
    maxLength: 100,
  },
  {
    name: 'company',
    label: 'Company name',
    autoComplete: 'organization',
    maxLength: 150,
  },
  {
    name: 'email',
    label: 'Business email address',
    autoComplete: 'email',
    maxLength: 254,
  },
  {
    name: 'size',
    label: 'Company size (optional)',
    autoComplete: 'off',
    maxLength: 80,
  },
]

export default function RequestDemo() {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'success'>('idle')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || status === 'success') return
    pending.current = true
    setStatus('sending')
    setError('')
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    try {
      await submitDemoRequest(data)
      form.reset()
      setStatus('success')
    } catch {
      setStatus('idle')
      setError('Could not submit your request. Please try again later.')
    } finally {
      pending.current = false
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="fixed right-4 bottom-4 z-40 rounded-full bg-teal-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-teal-700 sm:right-8 sm:bottom-8"
        onClick={() => dialog.current?.showModal()}
      >
        Request a Demo
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="request-demo-title"
        className="fixed m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-black/60 dark:bg-slate-900 dark:text-white"
        onClose={() => trigger.current?.focus()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="request-demo-title" className="text-xl font-semibold">
            Request a Demo
          </h2>
          <button
            type="button"
            aria-label="Close demo request"
            className="rounded-lg px-3 py-2 text-xl hover:bg-slate-500/10"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {status === 'success' ? (
          <p role="status">
            Thank you for your interest in AgentForce Enterprise! Our team will
            be in touch shortly to discuss your company's needs and schedule a
            personalized demonstration.
          </p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {fields.map((field) => (
              <label key={field.name} className="block space-y-1 text-sm">
                <span>{field.label}</span>
                <input
                  name={field.name}
                  type={field.name === 'email' ? 'email' : 'text'}
                  autoComplete={field.autoComplete}
                  maxLength={field.maxLength}
                  required={field.name !== 'size'}
                  className={input}
                  disabled={status === 'sending'}
                />
              </label>
            ))}
            <label className="block space-y-1 text-sm">
              <span>Description of business needs</span>
              <textarea
                name="description"
                required
                maxLength={3000}
                rows={4}
                className={input}
                disabled={status === 'sending'}
                placeholder="Tell us about your company, what you are looking for, and how AgentForce Enterprise could support your business."
              />
            </label>
            <div hidden aria-hidden="true">
              <label>
                Leave this field blank
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {error && <p role="alert">{error}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {status === 'sending' ? 'Submitting…' : 'Submit Demo Request'}
            </button>
          </form>
        )}
      </dialog>
    </>
  )
}
