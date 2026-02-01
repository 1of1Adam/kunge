/**
 * Progress Indicator Module
 * Shows/hides a centered overlay with a message and spinner animation.
 * Used during OCR processing to provide user feedback.
 */

const PROGRESS_CLASS = 'ocr-progress';

/**
 * Shows a centered progress overlay with the given message.
 * If already visible, updates the message text.
 * @param {string} message - Text to display (default: 'Processing image...')
 */
export function showProgress(message = 'Processing image...') {
  let el = document.querySelector(`.${PROGRESS_CLASS}`);

  if (el) {
    // Update message text (keep spinner intact)
    const msgEl = el.querySelector('.ocr-progress-msg');
    if (msgEl) {
      msgEl.textContent = message;
    }
    return;
  }

  el = document.createElement('div');
  el.className = PROGRESS_CLASS;
  el.innerHTML = `<div class="ocr-progress-spinner"></div><div class="ocr-progress-msg">${escapeHtml(message)}</div>`;
  document.body.appendChild(el);
}

/**
 * Hides and removes the progress overlay.
 * Safe to call even if not currently showing (no-op).
 */
export function hideProgress() {
  const el = document.querySelector(`.${PROGRESS_CLASS}`);
  if (el) {
    el.remove();
  }
}

/**
 * Basic HTML escaping for message text.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
