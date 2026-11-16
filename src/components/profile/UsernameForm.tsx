import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  createProfile,
  getProfileByHandle,
  updateProfile,
  type UserProfile,
} from '@/services/profiles'
import { inputClass, primaryButton } from '@/components/studio/parts'
import { cn } from '@/components/ui'
import {
  describeProfileError,
  displayNameProblem,
  handleFormatProblem,
  HANDLE_RULE,
  PUBLISHED_HANDLE_NOTE,
} from './handleRules'
import { rememberProfile } from './profileMemory'

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'mine' }
  | { state: 'error' }

export interface SavedProfile {
  handle: string
  display_name: string
}

interface UsernameFormProps {
  uid: string
  /** The current profile, or null to create one. */
  profile: Pick<UserProfile, 'handle' | 'display_name'> | null
  /** Prefills the display name when creating. */
  suggestedName: string
  /** Sent with createProfile. Only an https address is kept. */
  avatarUrl: string | null
  onSaved: (profile: SavedProfile) => void
}

const CHECK_DELAY_MS = 400

/**
 * Display name and username, with a live availability check. Creates the
 * profile when there is none, and updates it after.
 */
export function UsernameForm({
  uid,
  profile,
  suggestedName,
  avatarUrl,
  onSaved,
}: UsernameFormProps) {
  const [name, setName] = useState(profile?.display_name ?? suggestedName)
  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [touched, setTouched] = useState(false)
  const [availability, setAvailability] = useState<Availability>({
    state: 'idle',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const ids = {
    name: useId(),
    nameError: useId(),
    handle: useId(),
    rule: useId(),
    status: useId(),
    note: useId(),
  }

  const formatProblem = handleFormatProblem(handle)
  const nameProblem = displayNameProblem(name)
  const unchangedHandle = profile !== null && handle === profile.handle

  // Live availability: one handle lookup after the user stops typing.
  useEffect(() => {
    if (formatProblem || unchangedHandle) {
      setAvailability(unchangedHandle ? { state: 'mine' } : { state: 'idle' })
      return
    }
    let active = true
    setAvailability({ state: 'checking' })
    const timer = window.setTimeout(() => {
      getProfileByHandle(handle)
        .then((found) => {
          if (!active) return
          if (!found) setAvailability({ state: 'available' })
          else if (found.uid === uid) setAvailability({ state: 'mine' })
          else setAvailability({ state: 'taken' })
        })
        .catch(() => active && setAvailability({ state: 'error' }))
    }, CHECK_DELAY_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [handle, formatProblem, unchangedHandle, uid])

  const nothingChanged =
    profile !== null && unchangedHandle && name === profile.display_name
  const showFormatProblem = touched && handle !== '' && formatProblem
  const handleInvalid =
    Boolean(showFormatProblem) || availability.state === 'taken'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    setSaved(false)
    if (busy || nameProblem || formatProblem) {
      setError(nameProblem ?? formatProblem)
      return
    }
    if (availability.state === 'taken') {
      setError('That username is taken. Choose another one.')
      return
    }
    if (nothingChanged) return
    setBusy(true)
    setError(null)
    const display_name = name.trim()
    try {
      if (profile) {
        await updateProfile({
          display_name,
          ...(unchangedHandle ? {} : { handle }),
        })
      } else {
        await createProfile({
          handle,
          display_name,
          avatar_url:
            avatarUrl &&
            /^https:\/\//.test(avatarUrl) &&
            avatarUrl.length <= 2048
              ? avatarUrl
              : null,
        })
      }
      rememberProfile(uid, handle)
      setSaved(true)
      onSaved({ handle, display_name })
    } catch (err) {
      setError(describeProfileError(err))
      if (err instanceof Error && err.message === 'Handle is taken')
        setAvailability({ state: 'taken' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 text-sm">
      <div>
        <label
          htmlFor={ids.name}
          className="block font-medium text-slate-900 dark:text-white"
        >
          Display name
        </label>
        <input
          id={ids.name}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setSaved(false)
          }}
          maxLength={100}
          autoComplete="name"
          aria-invalid={(touched && Boolean(nameProblem)) || undefined}
          aria-describedby={touched && nameProblem ? ids.nameError : undefined}
          className={cn(
            inputClass(touched && Boolean(nameProblem)),
            'mt-1.5 h-10',
          )}
        />
        {touched && nameProblem && (
          <p
            id={ids.nameError}
            className="mt-1 text-xs text-rose-700 dark:text-rose-300"
          >
            {nameProblem}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={ids.handle}
          className="block font-medium text-slate-900 dark:text-white"
        >
          Username
        </label>
        <div className="relative mt-1.5">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            aria-hidden="true"
          >
            @
          </span>
          <input
            id={ids.handle}
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value.trim())
              setSaved(false)
            }}
            onBlur={() => setTouched(true)}
            maxLength={30}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={handleInvalid || undefined}
            aria-describedby={`${ids.status} ${ids.rule} ${profile ? ids.note : ''}`.trim()}
            className={cn(inputClass(handleInvalid), 'h-10 pl-7 font-mono')}
          />
        </div>
        <p id={ids.status} aria-live="polite" className="mt-1 min-h-4 text-xs">
          <HandleStatus
            problem={showFormatProblem || null}
            availability={availability}
            handle={handle}
          />
        </p>
        <p
          id={ids.rule}
          className="mt-1 text-xs text-slate-600 dark:text-slate-400"
        >
          {HANDLE_RULE} Your profile lives at /u/your-username.
        </p>
        {profile && (
          <p
            id={ids.note}
            className="mt-2 text-xs text-slate-600 dark:text-slate-400"
          >
            {PUBLISHED_HANDLE_NOTE}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={primaryButton}
          aria-disabled={busy || nothingChanged || undefined}
        >
          {busy && (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          )}
          {busy ? 'Saving' : profile ? 'Save changes' : 'Save username'}
        </button>
        {saved && (
          <p role="status" className="text-sm text-teal-700 dark:text-teal-300">
            Saved.
          </p>
        )}
      </div>
    </form>
  )
}

function HandleStatus({
  problem,
  availability,
  handle,
}: {
  problem: string | null
  availability: Availability
  handle: string
}) {
  if (problem)
    return <span className="text-rose-700 dark:text-rose-300">{problem}</span>
  switch (availability.state) {
    case 'checking':
      return (
        <span className="text-slate-600 dark:text-slate-400">
          Checking @{handle}
        </span>
      )
    case 'available':
      return (
        <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
          <Check className="size-3.5" aria-hidden="true" />@{handle} is free.
        </span>
      )
    case 'taken':
      return (
        <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
          <X className="size-3.5" aria-hidden="true" />@{handle} is taken.
          Choose another one.
        </span>
      )
    case 'mine':
      return (
        <span className="text-slate-600 dark:text-slate-400">
          This is your username now.
        </span>
      )
    case 'error':
      return (
        <span className="text-slate-600 dark:text-slate-400">
          Could not check right now. You can still try to save it.
        </span>
      )
    default:
      return null
  }
}
