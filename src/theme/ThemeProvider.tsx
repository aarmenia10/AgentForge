import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CUSTOM,
  browserStorage,
  clearAppearance,
  loadState,
  resetState,
  saveState,
  tokensFor,
  type AppearanceState,
  type Mode,
} from './appearance'

export type Theme = Mode

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  /** The chosen background, accent, and mode. */
  appearance: AppearanceState
  /** Short messages about colors that were adjusted automatically. */
  warnings: string[]
  setBackground: (choice: string) => void
  setCustomBackground: (hex: string) => void
  setAccent: (choice: string) => void
  setCustomAccent: (hex: string) => void
  resetAppearance: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Writes the derived variables onto <html>. No Firestore, only the document. */
function applyToDocument(state: AppearanceState): string[] {
  const { tokens, warnings, dark } = tokensFor(state)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)
  return warnings
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceState>(() => loadState(browserStorage()))
  const warnings = useMemo(() => tokensFor(appearance).warnings, [appearance])

  useEffect(() => {
    applyToDocument(appearance)
  }, [appearance])

  const update = useCallback((next: AppearanceState) => {
    setAppearance(next)
    saveState(browserStorage(), next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: appearance.mode,
      setTheme: (mode) => update({ ...appearance, mode }),
      toggleTheme: () => update({ ...appearance, mode: appearance.mode === 'dark' ? 'light' : 'dark' }),
      appearance,
      warnings,
      setBackground: (choice) =>
        update({ ...appearance, bg: { ...appearance.bg, [appearance.mode]: choice } }),
      setCustomBackground: (hex) =>
        update({
          ...appearance,
          bg: { ...appearance.bg, [appearance.mode]: CUSTOM },
          customBg: { ...appearance.customBg, [appearance.mode]: hex },
        }),
      setAccent: (choice) => update({ ...appearance, accent: choice }),
      setCustomAccent: (hex) => update({ ...appearance, accent: CUSTOM, customAccent: hex }),
      resetAppearance: () => {
        clearAppearance(browserStorage())
        setAppearance(resetState())
      },
    }),
    [appearance, warnings, update],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
