/**
 * Watchlist Bridge - TradingView watchList() API wrapper.
 * Safely appends symbols to the active watchlist, preserving existing items
 * and section dividers (###-prefixed entries).
 *
 * @module watchlistBridge
 */

const LOG_PREFIX = '[WatchlistBridge]';

/**
 * Appends symbols to the active TradingView watchlist without losing
 * existing items or section dividers.
 *
 * @param {object} widget - TradingView widget instance
 * @param {string[]} symbols - Array of exchange-prefixed symbols (e.g., ['SSE:600519'])
 * @returns {Promise<number>} Count of actually added (non-duplicate) symbols
 * @throws {Error} If no active watchlist or API access fails
 */
export async function appendToWatchlist(widget, symbols) {
  let watchlistApi;
  try {
    watchlistApi = await widget.watchList();
  } catch (err) {
    console.error(LOG_PREFIX, 'Failed to access watchlist API:', err);
    throw new Error('Failed to access watchlist API');
  }

  try {
    const activeListId = watchlistApi.getActiveListId();
    if (!activeListId) {
      throw new Error('No active watchlist found');
    }

    const currentList = watchlistApi.getList(activeListId) || [];

    // Filter out ###-prefixed section dividers when checking for duplicates
    const existingSymbols = currentList.filter((s) => !s.startsWith('###'));

    // Only add symbols that are not already in the watchlist
    const toAdd = symbols.filter((s) => !existingSymbols.includes(s));

    if (toAdd.length === 0) {
      return 0;
    }

    // Preserve entire current list (including section dividers) and append new symbols
    watchlistApi.updateList(activeListId, [...currentList, ...toAdd]);

    return toAdd.length;
  } catch (err) {
    console.error(LOG_PREFIX, 'Error updating watchlist:', err);
    throw err;
  }
}

/**
 * Gets current watchlist symbols (excluding section dividers).
 *
 * @param {object} widget - TradingView widget instance
 * @returns {Promise<string[]>} Array of symbol strings, empty if no active list
 */
export async function getCurrentWatchlistSymbols(widget) {
  let watchlistApi;
  try {
    watchlistApi = await widget.watchList();
  } catch (err) {
    console.error(LOG_PREFIX, 'Failed to access watchlist API:', err);
    throw new Error('Failed to access watchlist API');
  }

  try {
    const activeListId = watchlistApi.getActiveListId();
    if (!activeListId) {
      return [];
    }

    const currentList = watchlistApi.getList(activeListId) || [];

    // Return only actual symbols, excluding ###-prefixed section dividers
    return currentList.filter((s) => !s.startsWith('###'));
  } catch (err) {
    console.error(LOG_PREFIX, 'Error reading watchlist:', err);
    throw err;
  }
}
