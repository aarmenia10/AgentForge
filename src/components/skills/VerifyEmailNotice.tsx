import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Notice, smallButton } from '@/components/studio/parts'

/** The Studio's confirm-your-email notice, for the skill upload screen. */
export function VerifyEmailNotice() {
  const { user, sendVerificationEmail, refreshUser } = useAuth()
  const [note, setNote] = useState('')
  return (
    <Notice tone="warn" title="Confirm your email before you save">
      <p>
        We sent a link to {user?.email ?? 'your address'}. Open it, then come
        back here.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButton}
          onClick={() =>
            sendVerificationEmail()
              .then(() => setNote('Sent. Check your inbox.'))
              .catch(() =>
                setNote('Could not send the email. Try again in a minute.'),
              )
          }
        >
          Send the email again
        </button>
        <button
          type="button"
          className={smallButton}
          onClick={() =>
            refreshUser()
              .then((u) =>
                setNote(
                  u?.emailVerified
                    ? ''
                    : 'Not confirmed yet. Open the link in the email first.',
                ),
              )
              .catch(() => setNote('Could not check. Try again.'))
          }
        >
          I have confirmed it
        </button>
      </div>
      {note && <p role="status">{note}</p>}
    </Notice>
  )
}
