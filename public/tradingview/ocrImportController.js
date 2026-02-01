/**
 * OCR Import Controller
 *
 * Pipeline orchestrator that wires all modules together:
 * upload -> OCR -> extract -> resolve names -> duplicate detect -> confirm -> watchlist
 * paste  -> OCR -> extract -> resolve names -> duplicate detect -> confirm -> watchlist
 */

import { recognizeImage } from './ocr/ocrEngine.js';
import { extractStockCodes } from './ocr/stockCodeExtractor.js';
import { createWatchlistUploadButton, onFileSelected } from './ui/uploadButton.js';
import { showConfirmationModal } from './ui/confirmationModal.js';
import { showProgress, hideProgress } from './ui/progressIndicator.js';
import { appendToWatchlist, getCurrentWatchlistSymbols } from './watchlistBridge.js';
import { initTheme } from './ui/themeManager.js';

/** Module-level busy flag — prevents concurrent OCR triggers (covers both processing and modal open). */
let ocrBusy = false;

/**
 * Resolve backend URL (same logic as index.html).
 */
function resolveBackendUrl() {
  const override = window.__BACKEND_URL__;
  if (typeof override === 'string' && override.trim().length) {
    return override.trim().replace(/\/$/, '');
  }
  const { hostname, port, protocol, origin } = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocalhost && port && port !== '3001') {
    return `${protocol}//${hostname}:3001`;
  }
  return origin;
}

/**
 * Batch-resolve stock names via the backend search API.
 * Enriches each stock object with a `name` field.
 * @param {Array<{code: string, exchange: string, symbol: string}>} stocks
 * @returns {Promise<Array<{code: string, exchange: string, symbol: string, name: string}>>}
 */
async function resolveStockNames(stocks) {
  const backendUrl = resolveBackendUrl();

  const results = await Promise.allSettled(
    stocks.map(async (stock) => {
      try {
        const res = await fetch(
          `${backendUrl}/api/datafeed/search?query=${encodeURIComponent(stock.code)}&limit=1`
        );
        if (!res.ok) return stock;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].description) {
          return { ...stock, name: data[0].description };
        }
      } catch {
        // Fallback: no name
      }
      return stock;
    })
  );

  return results.map((r) => (r.status === 'fulfilled' ? r.value : stocks[0]));
}

/**
 * Show a toast notification that auto-dismisses.
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'ocr-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ocr-toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('ocr-toast-visible');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// ---------------------------------------------------------------------------
// Shared OCR pipeline
// ---------------------------------------------------------------------------

/**
 * Shared image → OCR → confirm → watchlist pipeline.
 * Called by both the upload button flow and the clipboard paste flow.
 *
 * @param {string|File} imageSource - Image data URL or File object
 * @param {object} widget - TradingView widget instance
 * @param {object} [options]
 * @param {Function} [options.onRetry] - Retry callback (upload flow only)
 */
async function processImage(imageSource, widget, { onRetry } = {}) {
  if (ocrBusy) return;
  ocrBusy = true;

  try {
    showProgress('正在识别股票代码...');

    // If imageSource is a File, convert it to data URL first
    let imageInput = imageSource;
    if (imageSource instanceof File) {
      console.log('[processImage] Converting File to data URL...');
      imageInput = await convertToPng(imageSource);
    }

    const text = await recognizeImage(imageInput);
    const stocks = extractStockCodes(text);

    let modalStocks = stocks;
    if (stocks.length > 0) {
      showProgress('正在查询股票名称...');
      modalStocks = await resolveStockNames(stocks);
    }
    hideProgress();

    // Duplicate detection: compare against current watchlist
    let enrichedStocks = modalStocks;
    if (modalStocks.length > 0) {
      const existingSymbols = await getCurrentWatchlistSymbols(widget);
      const existingSet = new Set(existingSymbols);
      enrichedStocks = modalStocks.map((s) => ({
        ...s,
        isDuplicate: existingSet.has(s.symbol),
      }));
      // Sort: new first, duplicates last
      enrichedStocks.sort((a, b) => Number(a.isDuplicate) - Number(b.isDuplicate));
    }

    const modalOptions = {};
    if (onRetry) {
      modalOptions.onRetry = onRetry;
    }
    const selected = await showConfirmationModal(enrichedStocks, modalOptions);

    if (!selected || selected.length === 0) {
      return;
    }

    const count = await appendToWatchlist(widget, selected);
    const skipped = selected.length - count;
    if (skipped > 0) {
      showToast(`已添加 ${count} 个，跳过 ${skipped} 个重复`);
    } else {
      showToast(`已添加 ${count} 个股票到自选`);
    }
  } catch (error) {
    hideProgress();
    showToast(`出错了: ${error.message}`);
    console.error('[OCRImport]', error);
  } finally {
    ocrBusy = false;
  }
}

// ---------------------------------------------------------------------------
// Clipboard paste support
// ---------------------------------------------------------------------------

/**
 * Check whether an input-like element is focused (in main document or TradingView iframe).
 * When true, paste should fall through to default browser behaviour.
 */
function isInputFocused() {
  const el = document.activeElement;
  if (el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
  }
  // Check inside TradingView iframe (same-origin)
  const iframe = document.querySelector('iframe[id^="tradingview_"]');
  if (iframe && iframe.contentDocument) {
    const iframeEl = iframe.contentDocument.activeElement;
    if (iframeEl) {
      const iframeTag = iframeEl.tagName;
      if (iframeTag === 'INPUT' || iframeTag === 'TEXTAREA' || iframeTag === 'SELECT') return true;
      if (iframeEl.isContentEditable) return true;
    }
  }
  return false;
}

/**
 * Convert an image Blob/File to a PNG data URL via Canvas.
 * macOS clipboard often provides TIFF which Tesseract.js cannot read;
 * drawing through Canvas normalises any browser-decodable format to PNG.
 * Returns a data URL string instead of File/Blob to work around Tesseract.js v7
 * issues with File object reading.
 * @param {Blob} blob
 * @returns {Promise<string>} PNG data URL
 */
function convertToPng(blob) {
  return new Promise((resolve, reject) => {
    console.log('[convertToPng] Input blob:', { type: blob.type, size: blob.size });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      console.log('[convertToPng] Image loaded:', { width: img.naturalWidth, height: img.naturalHeight });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      // Convert canvas to data URL instead of Blob
      // This works around potential Tesseract.js v7 File reading issues
      const dataUrl = canvas.toDataURL('image/png');
      console.log('[convertToPng] Data URL created, length:', dataUrl.length);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    img.src = url;
  });
}

/**
 * Extract the first image from a ClipboardEvent as a data URL, converting to PNG if needed.
 * @param {ClipboardEvent} event
 * @returns {Promise<string|null>} PNG data URL or null
 */
async function getImageFromClipboard(event) {
  try {
    const items = event.clipboardData?.items;
    if (!items) return null;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) return null;
        // Always convert to PNG data URL to ensure compatibility with Tesseract.js
        // (even for formats that are nominally supported like PNG/JPEG)
        return await convertToPng(file);
      }
    }
    return null;
  } catch (err) {
    console.warn('[OCR] clipboard access error:', err);
    return null;
  }
}

/**
 * Register paste listeners on the main document and the TradingView iframe.
 * @param {object} widget - TradingView widget instance
 */
function setupPasteListener(widget) {
  async function handlePaste(event) {
    // Skip if an input-like element is focused — let browser handle normally
    if (isInputFocused()) return;
    // Skip if OCR is already in progress or modal is open
    if (ocrBusy) return;
    // Extract image from clipboard (async — converts TIFF to PNG if needed)
    const imageFile = await getImageFromClipboard(event);
    if (!imageFile) return;
    // Trigger OCR pipeline (no onRetry for paste flow)
    processImage(imageFile, widget);
    // NOTE: intentionally NOT calling event.preventDefault() or event.stopPropagation()
  }

  // Listen on main document
  document.addEventListener('paste', handlePaste);

  // Attach paste listener to TradingView iframe when it appears
  function attachToIframe() {
    const iframe = document.querySelector('iframe[id^="tradingview_"]');
    if (!iframe) return;
    try {
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc && !iframeDoc.__ocrPasteAttached) {
        iframeDoc.addEventListener('paste', handlePaste);
        iframeDoc.__ocrPasteAttached = true;
      }
    } catch {
      // Cross-origin iframe — cannot attach, ignore silently
    }
  }

  // Initial attempt
  attachToIframe();

  // Watch for iframe appearing later via MutationObserver
  const observer = new MutationObserver(() => {
    attachToIframe();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the OCR import feature.
 * Must be called after widget.onChartReady() fires.
 * @param {object} widget - TradingView widget instance
 */
export async function initOCRImport(widget) {
  initTheme(widget);
  createWatchlistUploadButton(widget);
  setupPasteListener(widget);

  // Get reference to file input for retry callback
  const fileInputEl = document.getElementById('ocr-file-input');

  onFileSelected(async (file) => {
    await processImage(file, widget, { onRetry: () => fileInputEl && fileInputEl.click() });
  });

  console.info('[OCRImport] Initialized (upload + paste)');
}
