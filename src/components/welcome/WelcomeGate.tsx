import { useEffect, useState } from 'react'
import { getProfile } from '@/services/profiles'
import { rememberProfile, rememberWelcomed } from '../profile/profileMemory'
import { WelcomeDialog } from './WelcomeDialog'

interface WelcomeGateProps {
  uid: string
  suggestedName: string
  avatarUrl: string | null
}

/**
 * Loaded only for a signed-in user this browser has not yet seen with a
 * profile or a welcome. One profile read decides: a profile means remember it
 * and show nothing; none means show the welcome step, once.
 */
export default function WelcomeGate({
  uid,
  suggestedName,
  avatarUrl,
}: WelcomeGateProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let active = true
    getProfile(uid)
      .then((profile) => {
        if (!active) return
        if (profile) {
          rememberProfile(uid, profile.handle)
          return
        }
        // Shown once: remembered the moment it appears, whatever happens next.
        rememberWelcomed(uid)
        setShow(true)
      })
      // Offline or refused: stay quiet and try again on a later visit.
      .catch(() => {})
    return () => {
      active = false
    }
  }, [uid])

  if (!show) return null
  return (
    <WelcomeDialog
      uid={uid}
      suggestedName={suggestedName}
      avatarUrl={avatarUrl}
      onClose={() => setShow(false)}
    />
  )
}
