import { Check, Moon, RotateCcw, Sun } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import {
  ACCENTS,
  CUSTOM,
  DARK_BACKGROUNDS,
  LIGHT_BACKGROUNDS,
  parseHex,
  toHex,
  type Preset,
} from '@/theme/appearance'
import { useTheme } from '@/theme/ThemeProvider'
import { cn } from '../ui'

const swatchBase =
  'relative grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-inset ring-[color-mix(in_oklab,var(--lm-text)_25%,transparent)] transition hover:scale-110'
const swatchSelected =
  'outline-2 outline-offset-2 outline-[var(--lm-accent-text)]'

function rgbCss(preset: Preset): string {
  return `rgb(${preset.rgb.join(' ')})`
}

function SwatchRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-2.5"
    >
      {children}
    </div>
  )
}

function Swatch({
  preset,
  selected,
  onSelect,
}: {
  preset: Preset
  selected: boolean
  onSelect: () => void
}) {
  const ink =
    preset.rgb.reduce((a, b) => a + b, 0) > 380 ? 'text-black' : 'text-white'
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={preset.label}
      title={preset.label}
      onClick={onSelect}
      style={{ backgroundColor: rgbCss(preset) }}
      className={cn(swatchBase, selected && swatchSelected)}
    >
      {selected && <Check className={cn('size-4', ink)} aria-hidden="true" />}
    </button>
  )
}

/** A swatch that wraps a native color input, so it stays keyboard reachable. */
function CustomSwatch({
  label,
  value,
  selected,
  onChange,
}: {
  label: string
  value: string
  selected: boolean
  onChange: (hex: string) => void
}) {
  return (
    <label
      title={label}
      className={cn(
        swatchBase,
        'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--lm-accent-text)]',
        selected && swatchSelected,
      )}
      style={{
        background: selected
          ? value
          : 'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)',
      }}
    >
      <span className="sr-only">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  )
}

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mb-2.5 text-sm font-medium tracking-normal text-fg-muted"
    >
      {children}
    </h3>
  )
}

/**
 * Mode, background, and accent pickers plus a reset. Used by the nav popover
 * and the Appearance section in Settings.
 */
export function AppearanceControls() {
  const {
    appearance,
    warnings,
    theme,
    setTheme,
    setBackground,
    setCustomBackground,
    setAccent,
    setCustomAccent,
    resetAppearance,
  } = useTheme()
  const uid = useId()
  const backgrounds = theme === 'dark' ? DARK_BACKGROUNDS : LIGHT_BACKGROUNDS
  const bgChoice = appearance.bg[theme]
  const customBg = parseHex(appearance.customBg[theme])

  return (
    <div className="space-y-6 text-sm">
      <section aria-labelledby={`${uid}-mode`}>
        <Heading id={`${uid}-mode`}>Mode</Heading>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-mode`}
          className="flex rounded-full bg-page p-1"
        >
          {(['dark', 'light'] as const).map((mode) => {
            const Icon = mode === 'dark' ? Moon : Sun
            const active = theme === mode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(mode)}
                className={cn(
                  'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-3 font-medium transition',
                  active
                    ? 'bg-accent text-accent-ink'
                    : 'text-fg-muted hover:text-fg',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {mode === 'dark' ? 'Dark' : 'Light'}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby={`${uid}-bg`}>
        <Heading id={`${uid}-bg`}>
          {theme === 'dark' ? 'Dark' : 'Light'} background
        </Heading>
        <SwatchRow label="Background">
          {backgrounds.map((preset) => (
            <Swatch
              key={preset.id}
              preset={preset}
              selected={bgChoice === preset.id}
              onSelect={() => setBackground(preset.id)}
            />
          ))}
          <CustomSwatch
            label="Custom background color"
            value={
              customBg
                ? toHex(customBg)
                : backgrounds[0]
                  ? toHex(backgrounds[0].rgb)
                  : '#000000'
            }
            selected={bgChoice === CUSTOM}
            onChange={setCustomBackground}
          />
        </SwatchRow>
        <p className="mt-2 text-xs text-fg-muted">
          {bgChoice === CUSTOM
            ? 'Custom'
            : (backgrounds.find((preset) => preset.id === bgChoice)?.label ??
              'Custom')}
        </p>
      </section>

      <section aria-labelledby={`${uid}-accent`}>
        <Heading id={`${uid}-accent`}>Accent</Heading>
        <SwatchRow label="Accent">
          {ACCENTS.map((preset) => (
            <Swatch
              key={preset.id}
              preset={preset}
              selected={appearance.accent === preset.id}
              onSelect={() => setAccent(preset.id)}
            />
          ))}
          <CustomSwatch
            label="Custom accent color"
            value={toHex(parseHex(appearance.customAccent) ?? ACCENTS[0].rgb)}
            selected={appearance.accent === CUSTOM}
            onChange={setCustomAccent}
          />
        </SwatchRow>
        <p className="mt-2 text-xs text-fg-muted">
          {appearance.accent === CUSTOM
            ? 'Custom'
            : (ACCENTS.find((preset) => preset.id === appearance.accent)
                ?.label ?? 'Custom')}
        </p>
      </section>

      {warnings.length > 0 && (
        <div
          role="status"
          className="space-y-1 rounded-2xl bg-page p-3 text-xs text-fg"
        >
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={resetAppearance}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-page px-4 font-medium text-fg transition hover:-translate-y-0.5 hover:bg-surface-2"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reset to default
      </button>
    </div>
  )
}
