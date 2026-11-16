import { MailCheck, MailWarning } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { secondaryButton } from '../studio/parts'

/** Verify-email state, with resend and "I have confirmed it". */
export function EmailSettings() {
  const { user, needsEmailVerification, sendVerificationEmail, refreshUser } =
    useAuth()
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    'idle',
  )
  const [check, setCheck] = useState<
    'idle' | 'checking' | 'not-yet' | 'failed'
  >('idle')
  if (!user) return null

  if (!needsEmailVerification) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <MailCheck
          className="mt-0.5 size-4 shrink-0 text-teal-700 dark:text-teal-300"
          aria-hidden="true"
        />
        <span>
          {user.email} is confirmed. You can publish agents and send friend
          requests.
        </span>
      </p>
    )
  }

  async function onResend() {
    if (resend === 'sending') return
    setResend('sending')
    try {
      await sendVerificationEmail()
      setResend('sent')
    } catch {
      setResend('failed')
    }
  }

  async function onCheck() {
    if (check === 'checking') return
    setCheck('checking')
    try {
      const fresh = await refreshUser()
      setCheck(fresh?.emailVerified ? 'idle' : 'not-yet')
    } catch {
      setCheck('failed')
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
      <p className="flex items-center gap-1.5 font-medium">
        <MailWarning className="size-4 shrink-0" aria-hidden="true" />
        {user.email} is not confirmed yet
      </p>
      <p className="mt-1 leading-relaxed">
        Open the link we sent to that address. Publishing and friend requests
        unlock once it is confirmed.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCheck}
          aria-disabled={check === 'checking' || undefined}
          className={secondaryButton}
        >
          {check === 'checking' ? 'Checking' : 'I have confirmed it'}
        </button>
        <button
          type="button"
          onClick={onResend}
          aria-disabled={resend === 'sending' || undefined}
          className={secondaryButton}
        >
          {resend === 'sending' ? 'Sending' : 'Send the email again'}
        </button>
      </div>
      <p role="status" className="mt-2 text-xs empty:hidden">
        {check === 'not-yet' &&
          'Not confirmed yet. Open the link in the email, then try again.'}
        {check === 'failed' &&
          'Could not check right now. Try again in a minute.'}
        {check !== 'not-yet' &&
          check !== 'failed' &&
          resend === 'sent' &&
          'Sent. Check your inbox and spam folder.'}
        {check !== 'not-yet' &&
          check !== 'failed' &&
          resend === 'failed' &&
          'Could not send it right now. Try again in a few minutes.'}
      </p>
    </div>
  )
}
