const API_BASE_URL = 'http://localhost:3001';
const REALTIME_PATH = '/ws/realtime';
const REALTIME_RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 20000;

const DEFAULT_CONFIGURATION = {
  supported_resolutions: ['1', '5', '15', '30', '60', '120', '240', '1D'],
  supports_search: true,
  supports_group_request: false,
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: true,
};

const logPrefix = '[TradingViewDatafeed]';

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  return query.toString();
}

function buildRealtimeUrl(httpUrl) {
  const normalized = httpUrl.replace(/\/$/, '');
  if (/^https:/i.test(normalized)) {
    return normalized.replace(/^https:/i, 'wss:') + REALTIME_PATH;
  }
  if (/^http:/i.test(normalized)) {
    return normalized.replace(/^http:/i, 'ws:') + REALTIME_PATH;
  }
  return `ws://${normalized}${REALTIME_PATH}`;
}

function formatRealtimeBar(barPayload = {}) {
  return {
    time: safeNumber(barPayload.time),
    open: safeNumber(barPayload.open),
    high: safeNumber(barPayload.high),
    low: safeNumber(barPayload.low),
    close: safeNumber(barPayload.close),
    volume: safeNumber(barPayload.volume),
  };
}

function normalizeQuoteEntry(entry) {
  if (typeof entry === 'string') {
    return entry.trim();
  }
  if (entry && typeof entry === 'object') {
    if (typeof entry.symbol === 'string') return entry.symbol.trim();
    if (typeof entry.ticker === 'string') return entry.ticker.trim();
  }
  return '';
}

function normalizeQuoteList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((entry) => normalizeQuoteEntry(entry))
    .filter((symbol) => symbol.length);
  return Array.from(new Set(normalized));
}

function buildQuoteRequestPayload(symbols) {
  if (!Array.isArray(symbols)) return [];
  return symbols
    .map((entry) => {
      if (typeof entry === 'string') {
        const symbol = entry.trim();
        return symbol.length ? symbol : null;
      }
      if (entry && typeof entry === 'object') {
        const symbolName = normalizeQuoteEntry(entry);
        if (!symbolName) return null;
        const payload = { symbol: symbolName };
        if (typeof entry.session === 'string' && entry.session.trim().length) {
          payload.session = entry.session.trim();
        }
        return payload;
      }
      return null;
    })
    .filter(Boolean);
}

class TradingViewDatafeed {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.configuration = null;
    this.lastBarsCache = new Map();
    this.realtimeSubscriptions = new Map();
    this.quoteSubscriptions = new Map();
    this._ws = null;
    this._wsReady = false;
    this._wsQueue = [];
    this._wsReconnectTimer = null;
    this._heartbeatTimer = null;
    this._configPromise = null;
    console.info(logPrefix, 'Initialized with baseUrl:', this.baseUrl);
  }

  async _request(endpoint, params = {}) {
    const queryString = buildQuery(params);
    const url = queryString
      ? `${this.baseUrl}${endpoint}?${queryString}`
      : `${this.baseUrl}${endpoint}`;
    console.debug(logPrefix, 'Requesting:', url);
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status} for ${url}`);
      console.error(logPrefix, 'Request failed:', error);
      throw error;
    }
    const payload = await response.json();
    console.debug(logPrefix, 'Response:', payload);
    return payload;
  }

  onReady(callback) {
    console.info(logPrefix, 'onReady triggered');
    this._ensureConfiguration()
      .then((config) => {
        setTimeout(() => callback(config), 0);
      })
      .catch((error) => {
        console.error(logPrefix, 'Failed to load configuration, fallback to defaults', error);
        const fallback = { ...DEFAULT_CONFIGURATION };
        this.configuration = fallback;
        setTimeout(() => callback(fallback), 0);
      });
  }

  async _ensureConfiguration() {
    if (this.configuration) return this.configuration;
    if (!this._configPromise) {
      this._configPromise = this._request('/api/datafeed/config')
        .then((config) => {
          const normalized = { ...DEFAULT_CONFIGURATION, ...(config || {}) };
          this.configuration = normalized;
          return normalized;
        })
        .catch((error) => {
          this._configPromise = null;
          throw error;
        });
    }
    return this._configPromise;
  }

  async searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
    console.info(logPrefix, 'searchSymbols', { userInput, exchange, symbolType });
    try {
      const data = await this._request('/api/datafeed/search', {
        query: userInput || '',
        exchange: exchange || '',
        type: symbolType || '',
      });
      const results = Array.isArray(data) ? data : [];
      console.info(logPrefix, 'searchSymbols results:', results.length);
      onResultReadyCallback(results);
    } catch (error) {
      console.error(logPrefix, 'searchSymbols failed:', error);
      onResultReadyCallback([]);
    }
  }

  async searchSymbolsFull(userInput = '', symbolType = '', offset = 0) {
    try {
      const payload = await this._request('/api/datafeed/search/full', {
        query: userInput,
        type: symbolType,
        offset,
      });
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      console.error(logPrefix, 'searchSymbolsFull failed:', error);
      return [];
    }
  }

  async resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback, extension) {
    const sessionType = extension?.session;
    console.info(logPrefix, 'resolveSymbol', symbolName, 'session:', sessionType || 'default');
    try {
      const params = { symbol: symbolName };
      if (sessionType) {
        params.session = sessionType;
      }
      const data = await this._request('/api/datafeed/symbols', params);
      if (!data || data.s === 'error') {
        throw new Error(data?.errmsg || 'Symbol not found');
      }
      console.info(logPrefix, 'resolveSymbol success');
      onSymbolResolvedCallback(data);
    } catch (error) {
      console.error(logPrefix, 'resolveSymbol failed:', error);
      if (typeof onResolveErrorCallback === 'function') {
        onResolveErrorCallback(error);
      }
    }
  }

  async getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
    const { from, to, firstDataRequest } = periodParams;
    console.info(logPrefix, 'getBars', {
      symbol: symbolInfo?.ticker || symbolInfo?.name,
      resolution,
      from,
      to,
      firstDataRequest,
      session: symbolInfo?.subsession_id,
    });

    try {
      const params = {
        symbol: symbolInfo.ticker || symbolInfo.name,
        resolution,
        from,
        to,
      };
      if (symbolInfo.subsession_id) {
        params.session = symbolInfo.subsession_id;
      }
      const data = await this._request('/api/datafeed/history', params);

      if (data.s === 'no_data') {
        console.warn(logPrefix, 'getBars no data');
        onHistoryCallback([], { noData: true, nextTime: data.nextTime });
        return;
      }

      if (data.s !== 'ok' || !Array.isArray(data.t)) {
        throw new Error('Invalid history response');
      }

      const bars = data.t.map((time, index) => ({
        time: safeNumber(time) * 1000,
        open: safeNumber(data.o?.[index]),
        high: safeNumber(data.h?.[index]),
        low: safeNumber(data.l?.[index]),
        close: safeNumber(data.c?.[index]),
        volume: safeNumber(data.v?.[index]),
      }));

      console.info(logPrefix, `getBars returned ${bars.length} bars`);
      if (bars.length) {
        const lastBar = bars[bars.length - 1];
        this.lastBarsCache.set(this._getCacheKey(symbolInfo, resolution), { ...lastBar });
      }
      onHistoryCallback(bars, { noData: bars.length === 0 });
    } catch (error) {
      console.error(logPrefix, 'getBars failed:', error);
      if (typeof onErrorCallback === 'function') {
        onErrorCallback(error);
      }
    }
  }

  async getQuotes(symbols, onDataCallback, onErrorCallback) {
    const normalizedSymbols = normalizeQuoteList(symbols);
    console.info(logPrefix, 'getQuotes', normalizedSymbols);

    if (!normalizedSymbols.length) {
      onDataCallback([]);
      return;
    }

    const body = {
      symbols: buildQuoteRequestPayload(symbols),
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/datafeed/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const quotes = Array.isArray(payload) ? payload : [];
      onDataCallback(quotes);
    } catch (error) {
      console.error(logPrefix, 'getQuotes failed', error);
      if (typeof onErrorCallback === 'function') {
        onErrorCallback(error);
      }
    }
  }

  subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) {
    const symbol = symbolInfo?.ticker || symbolInfo?.name;
    if (!symbol) {
      console.error(logPrefix, 'subscribeBars missing symbolInfo');
      return;
    }
    console.info(logPrefix, 'subscribeBars', { symbol, resolution, subscriberUID });

    const existing = this.realtimeSubscriptions.get(subscriberUID);
    if (existing) {
      const oldSession = existing.session;
      const newSession = symbolInfo?.subsession_id;
      if (oldSession && newSession && oldSession !== newSession && typeof onResetCacheNeededCallback === 'function') {
        onResetCacheNeededCallback();
      }
    }

    this.realtimeSubscriptions.set(subscriberUID, {
      symbol,
      resolution,
      session: symbolInfo?.subsession_id,
      onRealtimeCallback,
      onResetCacheNeededCallback,
    });

    this._ensureRealtimeSocket();
    this._sendRealtimeMessage({
      type: 'subscribe',
      symbol,
      resolution,
      session: symbolInfo?.subsession_id,
      subscriberUID,
    });
  }

  unsubscribeBars(subscriberUID) {
    console.info(logPrefix, 'unsubscribeBars', subscriberUID);
    this.realtimeSubscriptions.delete(subscriberUID);
    this._sendRealtimeMessage({ type: 'unsubscribe', subscriberUID });

    if (this.realtimeSubscriptions.size === 0 && this.quoteSubscriptions.size === 0) {
      this._cleanupSocket();
    }
  }

  subscribeQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID) {
    const normalizedSymbols = normalizeQuoteList(symbols);
    const normalizedFastSymbols = []; // fast lane not used
    const guid = typeof listenerGUID === 'string' ? listenerGUID.trim() : '';

    if (!guid) {
      console.error(logPrefix, 'subscribeQuotes missing listenerGUID');
      return;
    }

    this.quoteSubscriptions.set(guid, {
      symbols: normalizedSymbols,
      fastSymbols: normalizedFastSymbols,
      callback: onRealtimeCallback,
    });

    const initialSymbols = Array.from(new Set([...normalizedSymbols, ...normalizedFastSymbols]));
    if (initialSymbols.length && typeof onRealtimeCallback === 'function') {
      this.getQuotes(initialSymbols, (quotes) => {
        try {
          onRealtimeCallback(quotes);
        } catch (error) {
          console.error(logPrefix, 'initial quote callback error', error);
        }
      }, (error) => {
        console.warn(logPrefix, 'initial getQuotes failed before subscribeQuotes', error);
      });
    }

    this._sendRealtimeMessage({
      type: 'subscribe_quotes',
      listenerGUID: guid,
      symbols: normalizedSymbols,
      fastSymbols: normalizedFastSymbols,
    });

    this._ensureRealtimeSocket();
  }

  unsubscribeQuotes(listenerGUID) {
    const guid = typeof listenerGUID === 'string' ? listenerGUID.trim() : '';
    if (!guid) return;
    this.quoteSubscriptions.delete(guid);
    this._sendRealtimeMessage({ type: 'unsubscribe_quotes', listenerGUID: guid });

    if (this.quoteSubscriptions.size === 0 && this.realtimeSubscriptions.size === 0) {
      this._cleanupSocket();
    }
  }

  _getCacheKey(symbolInfo, resolution) {
    const symbol = typeof symbolInfo === 'string' ? symbolInfo : (symbolInfo?.ticker || symbolInfo?.name || '');
    return `${symbol}__${resolution || ''}`;
  }

  _ensureRealtimeSocket() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (!this.realtimeSubscriptions.size && !this.quoteSubscriptions.size) return;

    const url = buildRealtimeUrl(this.baseUrl);
    this._ws = new WebSocket(url);
    this._wsReady = false;

    this._ws.onopen = () => {
      console.info(logPrefix, 'Realtime socket connected');
      this._wsReady = true;
      this._flushRealtimeQueue();
      this._resubscribeAll();
      this._startHeartbeat();
    };

    this._ws.onmessage = (event) => this._handleRealtimeMessage(event);

    this._ws.onclose = () => {
      console.warn(logPrefix, 'Realtime socket closed');
      this._wsReady = false;
      this._stopHeartbeat();
      this._ws = null;
      this._scheduleReconnect();
    };

    this._ws.onerror = (error) => {
      console.error(logPrefix, 'Realtime socket error:', error);
    };
  }

  _handleRealtimeMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error(logPrefix, 'Invalid realtime payload', error);
      return;
    }

    switch (payload?.type) {
      case 'bar':
        this._handleIncomingBar(payload);
        break;
      case 'quote':
        this._handleIncomingQuote(payload);
        break;
      case 'error':
        console.error(logPrefix, 'Realtime error', payload);
        break;
      case 'subscribed':
        console.debug(logPrefix, 'Realtime subscribed', payload.subscriberUID);
        break;
      case 'quote_subscribed':
        console.debug(logPrefix, 'Realtime quotes subscribed', payload.listenerGUID);
        break;
      case 'adapter_status':
        console.warn(logPrefix, 'Adapter status update', payload.status);
        break;
      case 'pong':
      case 'hello':
        break;
      default:
        console.debug(logPrefix, 'Realtime event', payload);
    }
  }

  _handleIncomingBar(payload) {
    const { subscriberUID, bar } = payload;
    if (!subscriberUID || !bar) return;
    const subscription = this.realtimeSubscriptions.get(subscriberUID);
    if (!subscription) return;

    const formattedBar = formatRealtimeBar(bar);
    const cacheKey = this._getCacheKey(subscription.symbol, subscription.resolution);
    this.lastBarsCache.set(cacheKey, formattedBar);

    if (typeof subscription.onRealtimeCallback === 'function') {
      subscription.onRealtimeCallback(formattedBar);
    }
  }

  _handleIncomingQuote(payload) {
    const { listenerGUID, quotes } = payload;
    if (!listenerGUID || !Array.isArray(quotes)) return;
    const subscription = this.quoteSubscriptions.get(listenerGUID);
    if (!subscription || typeof subscription.callback !== 'function') return;
    try {
      subscription.callback(quotes);
    } catch (error) {
      console.error(logPrefix, 'quote callback error', error);
    }
  }

  _sendRealtimeMessage(message) {
    if (!message) return;
    const serialized = JSON.stringify(message);
    if (this._wsReady && this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(serialized);
      return;
    }
    this._wsQueue.push(serialized);
    this._ensureRealtimeSocket();
  }

  _flushRealtimeQueue() {
    if (!this._wsReady || !this._ws) return;
    while (this._wsQueue.length) {
      const payload = this._wsQueue.shift();
      try {
        this._ws.send(payload);
      } catch (error) {
        console.error(logPrefix, 'Failed to send realtime payload', error);
        break;
      }
    }
  }

  _resubscribeAll() {
    this.realtimeSubscriptions.forEach((subscription, subscriberUID) => {
      this._sendRealtimeMessage({
        type: 'subscribe',
        symbol: subscription.symbol,
        resolution: subscription.resolution,
        session: subscription.session,
        subscriberUID,
      });
    });

    this.quoteSubscriptions.forEach((subscription, listenerGUID) => {
      this._sendRealtimeMessage({
        type: 'subscribe_quotes',
        listenerGUID,
        symbols: subscription.symbols,
        fastSymbols: subscription.fastSymbols,
      });
    });
  }

  _scheduleReconnect() {
    if (this._wsReconnectTimer || (!this.realtimeSubscriptions.size && !this.quoteSubscriptions.size)) return;
    this._wsReconnectTimer = setTimeout(() => {
      this._wsReconnectTimer = null;
      if (this.realtimeSubscriptions.size || this.quoteSubscriptions.size) {
        console.info(logPrefix, 'Attempting realtime reconnect...');
        this._ensureRealtimeSocket();
      }
    }, REALTIME_RECONNECT_DELAY_MS);
  }

  _cleanupSocket() {
    this._stopHeartbeat();
    if (this._ws) {
      try {
        this._ws.close();
      } catch (error) {
        console.error(logPrefix, 'Failed to close realtime socket', error);
      }
    }
    this._ws = null;
    this._wsReady = false;
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
  }

  _startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._heartbeatTimer = setInterval(() => {
      this._sendRealtimeMessage({ type: 'ping', timestamp: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
}

export default TradingViewDatafeed;
