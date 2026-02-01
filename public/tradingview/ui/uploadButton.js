/**
 * Upload Button Module
 * Injects an upload button into the TradingView watchlist panel near the "+" button.
 * TradingView renders its UI inside an iframe — we find and inject into the iframe's document.
 * Uses MutationObserver for reliable injection and re-injection after widgetbar toggle.
 */

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let fileInput = null;

/**
 * Creates a hidden file input and injects an upload button into the watchlist panel
 * near the "+" (add symbol) button via MutationObserver.
 *
 * @param {object} widget - TradingView widget instance
 * @returns {{ input: HTMLInputElement }}
 */
export function createWatchlistUploadButton(widget) {
  // Prevent duplicate file input creation
  if (fileInput) {
    return { input: fileInput };
  }

  // Hidden file input appended to main document body
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.id = 'ocr-file-input';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const UPLOAD_BTN_ID = 'ocr-watchlist-upload-btn';
  // SVG icon: stroke-based, stroke-width 1, rendered at 20x20
  const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.8 0L6 19"/><circle cx="9" cy="9" r="2"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/></svg>';

  /**
   * Get the TradingView iframe's contentDocument.
   * TradingView widget renders all UI (including widgetbar) inside a same-origin iframe.
   * @returns {Document|null}
   */
  function getWidgetDocument() {
    const iframe = document.querySelector('iframe[id^="tradingview_"]');
    if (iframe && iframe.contentDocument) {
      return iframe.contentDocument;
    }
    return null;
  }

  /**
   * Try to find the watchlist "+" (add symbol) button in the widget iframe.
   * @param {Document} doc - The document to search in
   * @returns {HTMLElement|null}
   */
  function findAddButton(doc) {
    // Strategy 1: data-name attribute
    const byDataName = doc.querySelector('[data-name="add-symbol-button"]');
    if (byDataName) return byDataName;

    // Strategy 2: class-based selector
    const byClass = doc.querySelector('.tv-watchlist__add-btn');
    if (byClass) return byClass;

    return null;
  }

  /**
   * Inject the upload button next to the "+" button if not already present.
   */
  function tryInject() {
    const widgetDoc = getWidgetDocument();
    if (!widgetDoc) return;

    // Already injected?
    if (widgetDoc.getElementById(UPLOAD_BTN_ID)) return;

    const addBtn = findAddButton(widgetDoc);
    if (!addBtn || !addBtn.parentElement) return;

    // Clone the native button's class list and structure for identical styling & hover
    const uploadBtn = widgetDoc.createElement('button');
    uploadBtn.id = UPLOAD_BTN_ID;
    uploadBtn.type = 'button';
    uploadBtn.className = addBtn.className;
    uploadBtn.setAttribute('data-tooltip', '从截图中识别股票代码并导入自选');
    uploadBtn.title = '从截图中识别股票代码并导入自选';

    // Mirror native structure: <span class="icon-..."><svg /></span>
    const iconSpan = addBtn.querySelector('span[class*="icon"]');
    const wrapper = widgetDoc.createElement('span');
    wrapper.setAttribute('role', 'img');
    wrapper.setAttribute('aria-hidden', 'true');
    if (iconSpan) wrapper.className = iconSpan.className;
    wrapper.innerHTML = ICON_SVG;
    uploadBtn.appendChild(wrapper);

    // Toggle hover class to match native hover behavior (::before background)
    const hoverClass = Array.from(addBtn.classList).find(c => c.startsWith('isInteractive-'))
      ? Array.from(addBtn.classList).find(c => c.startsWith('isInteractive-')).replace('isInteractive-', 'hover-')
      : null;
    if (hoverClass) {
      uploadBtn.addEventListener('mouseenter', () => uploadBtn.classList.add(hoverClass));
      uploadBtn.addEventListener('mouseleave', () => uploadBtn.classList.remove(hoverClass));
    }

    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    addBtn.parentElement.insertBefore(uploadBtn, addBtn);
  }

  /**
   * Start observing the widget iframe for DOM changes.
   * Tracks the current iframe to detect iframe replacement.
   * Uses debounced callback to avoid thrashing on high-frequency DOM updates.
   */
  let iframeObserver = null;
  let currentIframe = null;
  let debounceTimer = null;

  function debouncedTryInject() {
    if (debounceTimer) return;
    debounceTimer = requestAnimationFrame(() => {
      debounceTimer = null;
      tryInject();
    });
  }

  function observeWidgetIframe() {
    const iframe = document.querySelector('iframe[id^="tradingview_"]');
    if (!iframe || !iframe.contentDocument) return;

    // If iframe changed (recreated), disconnect old observer
    if (iframe !== currentIframe) {
      if (iframeObserver) {
        iframeObserver.disconnect();
        iframeObserver = null;
      }
      currentIframe = iframe;
    }

    if (!iframeObserver) {
      iframeObserver = new MutationObserver(debouncedTryInject);
      iframeObserver.observe(iframe.contentDocument.body, {
        childList: true,
        subtree: true,
      });
      tryInject();
    }
  }

  // Watch for the iframe to appear in the main document
  const mainObserver = new MutationObserver(() => {
    observeWidgetIframe();
  });

  mainObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial attempt
  observeWidgetIframe();

  // Handle widgetbar visibility changes (toggle sidebar)
  // When sidebar toggles, TradingView may re-render the watchlist panel,
  // destroying our button. Try re-inject after a short delay.
  try {
    widget.subscribe('widgetbar_visibility_changed', () => {
      // Stagger retries: TradingView re-renders asynchronously
      setTimeout(tryInject, 100);
      setTimeout(tryInject, 500);
    });
  } catch {
    // Widget may not support this event; observers handle it
  }

  return { input: fileInput };
}

/**
 * Registers a callback for file selection events.
 * Validates the file is an accepted image type and resets input after reading.
 * @param {(file: File) => void} callback
 */
export function onFileSelected(callback) {
  if (!fileInput) {
    fileInput = document.getElementById('ocr-file-input');
  }

  if (!fileInput) {
    console.error('[OCR Upload] File input not found. Call createWatchlistUploadButton() first.');
    return;
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      console.warn('[OCR Upload] Unsupported file type:', file.type);
      fileInput.value = '';
      return;
    }

    callback(file);

    // Reset so re-selecting the same file triggers change again
    fileInput.value = '';
  });
}
