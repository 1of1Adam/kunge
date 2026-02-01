/**
 * OCR Import Controller
 *
 * Pipeline orchestrator that wires all modules together:
 * upload -> OCR -> extract -> resolve names -> duplicate detect -> confirm -> watchlist
 */

import { recognizeImage } from './ocr/ocrEngine.js';
import { extractStockCodes } from './ocr/stockCodeExtractor.js';
import { createWatchlistUploadButton, onFileSelected } from './ui/uploadButton.js';
import { showConfirmationModal } from './ui/confirmationModal.js';
import { showProgress, hideProgress } from './ui/progressIndicator.js';
import { appendToWatchlist, getCurrentWatchlistSymbols } from './watchlistBridge.js';
import { initTheme } from './ui/themeManager.js';

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

/**
 * Initialize the OCR import feature.
 * Must be called after widget.onChartReady() fires.
 * @param {object} widget - TradingView widget instance
 */
export async function initOCRImport(widget) {
  initTheme(widget);
  createWatchlistUploadButton(widget);

  // Get reference to file input for retry callback
  const fileInputEl = document.getElementById('ocr-file-input');

  onFileSelected(async (file) => {
    try {
      showProgress('正在识别股票代码...');

      const text = await recognizeImage(file);
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

      const selected = await showConfirmationModal(enrichedStocks, {
        onRetry: () => fileInputEl && fileInputEl.click(),
      });

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
    }
  });

  console.info('[OCRImport] Initialized');
}
