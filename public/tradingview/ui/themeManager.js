/**
 * Theme Manager Module
 *
 * Centralizes theme detection, CSS variable application, and runtime
 * theme change listening for all OCR import UI elements.
 *
 * Usage: call initTheme(widget) once after widget.onChartReady().
 * All OCR styles in custom-styles.css consume var(--ocr-*) properties
 * set by this module on document.documentElement.
 */

const THEME_VARS = {
  light: {
    '--ocr-bg': '#ffffff',
    '--ocr-bg-secondary': '#f0f3fa',
    '--ocr-border': '#e0e3eb',
    '--ocr-text': '#131722',
    '--ocr-text-secondary': '#787b86',
    '--ocr-accent': '#2962ff',
    '--ocr-accent-hover': '#1e53e5',
    '--ocr-shadow': 'rgba(0,0,0,0.12)',
    '--ocr-backdrop': 'rgba(0,0,0,0.4)',
    '--ocr-disabled-bg': '#c8d1e0',
    '--ocr-item-hover': '#f0f3fa',
    '--ocr-item-border': '#f0f3fa',
    '--ocr-duplicate-text': '#b2b5be',
    '--ocr-cancel-hover': '#f0f3fa',
  },
  dark: {
    '--ocr-bg': '#1e222d',
    '--ocr-bg-secondary': '#2a2e39',
    '--ocr-border': '#363a45',
    '--ocr-text': '#d1d4dc',
    '--ocr-text-secondary': '#787b86',
    '--ocr-accent': '#2962ff',
    '--ocr-accent-hover': '#1e53e5',
    '--ocr-shadow': 'rgba(0,0,0,0.4)',
    '--ocr-backdrop': 'rgba(0,0,0,0.6)',
    '--ocr-disabled-bg': '#363a45',
    '--ocr-item-hover': '#2a2e39',
    '--ocr-item-border': '#2a2e39',
    '--ocr-duplicate-text': '#5d606b',
    '--ocr-cancel-hover': '#2a2e39',
  },
};

let currentTheme = 'light';

/**
 * Apply CSS custom properties for the given theme to :root.
 * @param {'light'|'dark'} theme
 */
function applyThemeVars(theme) {
  const vars = THEME_VARS[theme] || THEME_VARS.light;
  const root = document.documentElement.style;
  for (const [prop, value] of Object.entries(vars)) {
    root.setProperty(prop, value);
  }
  currentTheme = theme;
}

/**
 * Initialize theme system: detect current theme, apply CSS vars,
 * and subscribe to runtime theme changes.
 * @param {object} widget - TradingView widget instance
 */
export function initTheme(widget) {
  // Read initial theme
  const initial = widget.getTheme() || 'light';
  applyThemeVars(initial);

  // Subscribe to runtime theme changes
  widget.subscribe('chart_theme_changed', (themeName, isStandardTheme) => {
    if (isStandardTheme) {
      applyThemeVars(themeName);
    } else {
      // Non-standard theme — fall back to widget.getTheme() for light/dark
      const fallback = widget.getTheme() || 'light';
      applyThemeVars(fallback);
    }
  });
}

/**
 * Get the current active theme string.
 * @returns {'light'|'dark'}
 */
export function getTheme() {
  return currentTheme;
}
