/**
 * Stock Code Extractor
 *
 * Parses raw OCR text to identify valid 6-digit A-share stock codes,
 * deduplicates them, and maps each to the correct exchange prefix
 * for TradingView symbol format (e.g. SSE:600519).
 */

const EXCHANGE_MAP = {
  // SSE - Shanghai Stock Exchange
  '600': 'SSE',
  '601': 'SSE',
  '603': 'SSE',
  '605': 'SSE',
  '688': 'SSE',
  '689': 'SSE',
  // SZSE - Shenzhen Stock Exchange
  '000': 'SZSE',
  '001': 'SZSE',
  '002': 'SZSE',
  '003': 'SZSE',
  '300': 'SZSE',
  '301': 'SZSE',
};

/**
 * Extract valid A-share stock codes from OCR text.
 *
 * @param {string} ocrText - Raw text from Tesseract OCR
 * @returns {Array<{code: string, exchange: string, symbol: string}>}
 */
export function extractStockCodes(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') {
    return [];
  }

  const matches = ocrText.match(/\b\d{6}\b/g);
  if (!matches) {
    return [];
  }

  const unique = [...new Set(matches)];

  return unique
    .map((code) => {
      const prefix = code.substring(0, 3);
      const exchange = EXCHANGE_MAP[prefix];
      if (!exchange) {
        return null;
      }
      return { code, exchange, symbol: `${exchange}:${code}` };
    })
    .filter(Boolean);
}
