/**
 * ocrEngine.js - Lazy-loaded Tesseract.js OCR engine
 *
 * Downloads and initializes the OCR worker only when recognizeImage() is
 * first called, ensuring zero impact on page load performance.
 *
 * Tesseract.js v7 resources (~62 KB JS + ~15 MB WASM + ~2 MB lang data)
 * are fetched from jsDelivr CDN on demand.
 *
 * @module ocrEngine
 * @exports {Function} recognizeImage - Run OCR on an image source
 * @exports {Function} terminateWorker - Manually shut down the worker
 */

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js@7';

/** Auto-terminate worker after 5 minutes of idle to free WASM memory. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** @type {Promise<import('tesseract.js').Worker> | null} */
let workerPromise = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let idleTimer = null;

/**
 * Reset the idle auto-termination timer.
 * Called after every successful recognize call.
 */
function resetIdleTimer() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(async () => {
    try {
      await terminateWorker();
    } catch {
      // Swallow errors during auto-cleanup
    }
  }, IDLE_TIMEOUT_MS);
}

/**
 * Create and configure a Tesseract.js worker (internal).
 *
 * - Dynamically imports Tesseract.js ESM from jsDelivr (no page-load cost).
 * - Configures digit-only whitelist and SPARSE_TEXT PSM mode.
 * - Does NOT set corePath -- lets Tesseract auto-detect SIMD/non-SIMD.
 *
 * @returns {Promise<import('tesseract.js').Worker>}
 */
async function initWorker() {
  const Tesseract = (await import(
    /* webpackIgnore: true */
    `${CDN_BASE}/dist/tesseract.esm.min.js`
  )).default;

  const worker = await Tesseract.createWorker('eng', 1, {
    logger(m) {
      if (
        m.status === 'loading tesseract core' ||
        m.status === 'loading language traineddata'
      ) {
        const pct = Math.round((m.progress || 0) * 100);
        console.info(`[OCR] ${m.status}: ${pct}%`);
      }
    },
  });

  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '11', // SPARSE_TEXT
  });

  return worker;
}

/**
 * Run OCR on the given image source and return the recognised text.
 *
 * Accepts File, Blob, HTMLImageElement, HTMLCanvasElement, or a URL string
 * -- Tesseract.js handles all of these natively.
 *
 * The underlying WASM worker is lazily created on the first call and reused
 * for subsequent calls (singleton pattern).
 *
 * @param {File | Blob | HTMLImageElement | HTMLCanvasElement | string} imageSource
 * @returns {Promise<string>} Recognised text (digits only due to whitelist)
 */
export async function recognizeImage(imageSource) {
  if (workerPromise === null) {
    workerPromise = initWorker();
  }

  resetIdleTimer();

  const worker = await workerPromise;
  const { data } = await worker.recognize(imageSource);
  return data.text;
}

/**
 * Terminate the OCR worker and free WASM memory.
 *
 * Safe to call even if the worker was never created. After termination,
 * the next recognizeImage() call will re-initialise a fresh worker.
 */
export async function terminateWorker() {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (workerPromise !== null) {
    const worker = await workerPromise;
    workerPromise = null;
    await worker.terminate();
  }
}

// Clean up WASM memory when the user navigates away.
window.addEventListener('beforeunload', terminateWorker);
