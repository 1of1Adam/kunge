export type SlideTranslations = Record<string, string>;
export type PartTranslationData = Record<string, SlideTranslations>;

const OVERLAY_CLASS = 'slide-i18n-overlay';
const HIDDEN_ATTR = 'data-i18n-hidden';

const translationCache = new Map<string, PartTranslationData>();

/**
 * Load translation data for a part (e.g., "part01").
 * Caches results in memory.
 */
export async function loadPartTranslations(
  partKey: string,
): Promise<PartTranslationData | null> {
  if (translationCache.has(partKey)) {
    return translationCache.get(partKey)!;
  }
  try {
    const res = await fetch(`/encyclopedia/i18n/zh/${partKey}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as PartTranslationData;
    translationCache.set(partKey, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract the txt key from a span id (e.g., "txt5_536c62" -> "txt5").
 */
function getTxtKey(spanId: string): string | null {
  const match = spanId.match(/^(txt\d+)_/);
  return match ? match[1] : null;
}

/**
 * Shrink font-size so text fits within maxWidth.
 */
function fitTextToWidth(el: HTMLElement, maxWidth: number) {
  if (maxWidth <= 0) return;
  const fontSize = parseFloat(getComputedStyle(el).fontSize);
  const actualWidth = el.scrollWidth;
  if (actualWidth > maxWidth * 1.02) {
    const ratio = maxWidth / actualWidth;
    const newSize = Math.max(fontSize * ratio, 8);
    el.style.fontSize = `${newSize}px`;
  }
}

/**
 * Apply Chinese translation overlay on top of the original slide.
 * Original text spans are hidden; overlay divs are placed at the same positions.
 * Returns a cleanup function.
 */
export function applyTranslationOverlay(
  wrapperEl: HTMLElement,
  playerViewEl: HTMLElement,
  translations: SlideTranslations,
  scale: number,
): () => void {
  // Ensure clean state
  removeTranslationOverlay(wrapperEl, playerViewEl);

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  wrapperEl.appendChild(overlay);

  const playerRect = playerViewEl.getBoundingClientRect();
  const hiddenSpans: HTMLElement[] = [];

  const spans = playerViewEl.querySelectorAll<HTMLElement>('span[id^="txt"]');
  spans.forEach((span) => {
    if (span.classList.contains('nokern')) return;

    const txtKey = getTxtKey(span.id);
    if (!txtKey || !translations[txtKey]) return;

    // Compute position in the 960x540 unscaled canvas
    const spanRect = span.getBoundingClientRect();
    const x = (spanRect.left - playerRect.left) / scale;
    const y = (spanRect.top - playerRect.top) / scale;
    const dataWidth = parseFloat(span.getAttribute('data-width') || '0');

    // Copy visual styles from original span
    const computed = getComputedStyle(span);

    const textEl = document.createElement('div');
    textEl.textContent = translations[txtKey];
    textEl.style.position = 'absolute';
    textEl.style.left = `${x}px`;
    textEl.style.top = `${y}px`;
    textEl.style.color = computed.color;
    textEl.style.fontSize = computed.fontSize;
    textEl.style.fontWeight = computed.fontWeight;
    textEl.style.lineHeight = computed.lineHeight;
    textEl.style.fontFamily =
      "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif";
    textEl.style.whiteSpace = 'nowrap';
    textEl.style.pointerEvents = 'none';

    overlay.appendChild(textEl);

    // Shrink font if Chinese text is wider than original English width
    fitTextToWidth(textEl, dataWidth);

    // Hide original English span
    span.style.visibility = 'hidden';
    span.setAttribute(HIDDEN_ATTR, 'true');
    hiddenSpans.push(span);
  });

  return () => removeTranslationOverlay(wrapperEl, playerViewEl);
}

/**
 * Remove overlay and restore original English spans.
 */
export function removeTranslationOverlay(
  wrapperEl: HTMLElement,
  playerViewEl: HTMLElement,
): void {
  const overlay = wrapperEl.querySelector(`.${OVERLAY_CLASS}`);
  if (overlay) overlay.remove();

  const spans = playerViewEl.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`);
  spans.forEach((span) => {
    span.style.visibility = '';
    span.removeAttribute(HIDDEN_ATTR);
  });
}
