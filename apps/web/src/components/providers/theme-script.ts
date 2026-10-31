/**
 * Anti-FOUC theme bootstrap — same IIFE next-themes injects, but rendered from a
 * Server Component so React 19 does not warn about <script> in client components.
 */
export type ThemeScriptOptions = {
  attribute?: string | string[];
  storageKey?: string;
  defaultTheme?: string;
  forcedTheme?: string;
  themes?: string[];
  value?: Record<string, string>;
  enableSystem?: boolean;
  enableColorScheme?: boolean;
};

export const themeProviderProps = {
  attribute: 'class',
  defaultTheme: 'system',
  enableSystem: true,
  disableTransitionOnChange: true,
} as const;

function themeInit(
  attribute: string | string[],
  storageKey: string,
  defaultTheme: string,
  forcedTheme: string | undefined,
  themes: string[],
  value: Record<string, string> | undefined,
  enableSystem: boolean,
  enableColorScheme: boolean,
) {
  const el = document.documentElement;
  const colorSchemes = ['light', 'dark'];

  function update(theme: string) {
    const attrs = Array.isArray(attribute) ? attribute : [attribute];
    attrs.forEach((attr) => {
      const isClass = attr === 'class';
      const targets =
        isClass && value ? themes.map((t) => value[t] || t) : themes;
      if (isClass) {
        el.classList.remove(...targets);
        el.classList.add(value && value[theme] ? value[theme] : theme);
      } else {
        el.setAttribute(attr, theme);
      }
    });
    setColorScheme(theme);
  }

  function setColorScheme(theme: string) {
    if (enableColorScheme && colorSchemes.includes(theme)) {
      el.style.colorScheme = theme;
    }
  }

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  if (forcedTheme) {
    update(forcedTheme);
  } else {
    try {
      const stored = localStorage.getItem(storageKey) || defaultTheme;
      const theme =
        enableSystem && stored === 'system' ? getSystemTheme() : stored;
      update(theme);
    } catch {
      /* private mode / blocked storage */
    }
  }
}

export function getThemeInitScript(options: ThemeScriptOptions = {}): string {
  const {
    attribute = 'class',
    storageKey = 'theme',
    defaultTheme = 'system',
    forcedTheme,
    themes = ['light', 'dark'],
    value,
    enableSystem = true,
    enableColorScheme = true,
  } = options;

  const args = JSON.stringify([
    attribute,
    storageKey,
    defaultTheme,
    forcedTheme,
    themes,
    value,
    enableSystem,
    enableColorScheme,
  ]).slice(1, -1);

  return `(${themeInit.toString()})(${args})`;
}
