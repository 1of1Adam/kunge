var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/datafeed/datafeed-utils.js
function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
function floatEquals(a, b, epsilon = 1e-9) {
  return Math.abs(a - b) < epsilon;
}
function normalizeQuoteEntry(entry) {
  if (typeof entry === "string") {
    return entry.trim();
  }
  if (entry && typeof entry === "object") {
    if (typeof entry.symbol === "string") return entry.symbol.trim();
    if (typeof entry.ticker === "string") return entry.ticker.trim();
  }
  return "";
}
function normalizeQuoteList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list.map((entry) => normalizeQuoteEntry(entry)).filter((symbol) => symbol.length);
  return Array.from(new Set(normalized));
}

// src/datafeed/realtime-client.js
var REALTIME_PATH = "/ws/realtime";
var REALTIME_RECONNECT_BASE_DELAY_MS = 1e3;
var REALTIME_RECONNECT_MAX_DELAY_MS = 3e4;
var REALTIME_RECONNECT_BACKOFF_FACTOR = 1.5;
var MAX_RECONNECT_ATTEMPTS = 15;
var HEARTBEAT_INTERVAL_MS = 2e4;
var CLIENT_PONG_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2;
var MAX_WS_QUEUE_SIZE = 500;
var MAX_LAST_BARS_CACHE_SIZE = 100;
var MESSAGE_PRIORITY = Object.freeze({
  subscribe: 3,
  subscribe_quotes: 3,
  unsubscribe: 2,
  unsubscribe_quotes: 2,
  ping: 1,
  default: 2
});
var SUBSCRIPTION_MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "subscribe",
  "unsubscribe",
  "subscribe_quotes",
  "unsubscribe_quotes"
]);
var ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  ERROR: "error",
  DEGRADED: "degraded"
};
function buildRealtimeUrl(httpUrl) {
  const normalized = httpUrl.replace(/\/$/, "");
  if (/^https:/i.test(normalized)) {
    return normalized.replace(/^https:/i, "wss:") + REALTIME_PATH;
  }
  if (/^http:/i.test(normalized)) {
    return normalized.replace(/^http:/i, "ws:") + REALTIME_PATH;
  }
  return `ws://${normalized}${REALTIME_PATH}`;
}
function formatRealtimeBar(barPayload = {}) {
  const bar = {
    time: safeNumber(barPayload.time),
    open: safeNumber(barPayload.open),
    high: safeNumber(barPayload.high),
    low: safeNumber(barPayload.low),
    close: safeNumber(barPayload.close),
    volume: Math.max(0, safeNumber(barPayload.volume))
  };
  if (bar.high < bar.low) {
    [bar.high, bar.low] = [bar.low, bar.high];
  }
  bar.open = Math.max(bar.low, Math.min(bar.open, bar.high));
  bar.close = Math.max(bar.low, Math.min(bar.close, bar.high));
  return bar;
}
var RealtimeClient = class {
  constructor({ baseUrl, logPrefix: logPrefix2 = "[RealtimeClient]", fetchQuotes }) {
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
    this._logPrefix = logPrefix2;
    this._fetchQuotes = typeof fetchQuotes === "function" ? fetchQuotes : null;
    this.realtimeSubscriptions = /* @__PURE__ */ new Map();
    this.quoteSubscriptions = /* @__PURE__ */ new Map();
    this.lastBarsCache = /* @__PURE__ */ new Map();
    this._ws = null;
    this._wsReady = false;
    this._wsQueue = [];
    this._wsReconnectTimer = null;
    this._heartbeatTimer = null;
    this._wsClosingIntentionally = false;
    this._wsReconnectAttempts = 0;
    this._lastPongAt = Date.now();
    this._lastPingSentAt = null;
    this._lastPingRttMs = null;
    this._lastConnectionReset = null;
    this._lastSubscriptionReset = null;
    this._authTokenExpMs = null;
    this._authTokenRefreshFailures = 0;
    this._authTokenMaxFailures = null;
    this._awaitingAdapterRecovery = false;
    this._resubscribeInProgress = false;
    this._syncedRealtimeSubscriptions = /* @__PURE__ */ new Map();
    this._syncedQuoteSubscriptions = /* @__PURE__ */ new Map();
    this._hasConnectedOnce = false;
    this._pendingFullReset = false;
    this._pendingFullResetReason = null;
    this._quoteSubscribePending = /* @__PURE__ */ new Set();
    this._connectionState = ConnectionState.DISCONNECTED;
    this._connectionStateListeners = /* @__PURE__ */ new Set();
    this._fullResetListeners = /* @__PURE__ */ new Set();
    this._isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    this._broker = null;
    this._onSystemWarning = null;
  }
  get connectionState() {
    return this._connectionState;
  }
  get isOffline() {
    return this._isOffline;
  }
  onConnectionStateChange(listener) {
    this._connectionStateListeners.add(listener);
    return () => this._connectionStateListeners.delete(listener);
  }
  onFullReset(listener) {
    this._fullResetListeners.add(listener);
    return () => this._fullResetListeners.delete(listener);
  }
  setBroker(broker) {
    this._broker = broker;
  }
  setSystemWarningHandler(handler) {
    this._onSystemWarning = handler;
  }
  handleOffline() {
    if (this._isOffline) return;
    this._isOffline = true;
    this._setConnectionState(ConnectionState.DISCONNECTED, { reason: "offline" });
    this._stopHeartbeat();
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      try {
        this._wsClosingIntentionally = true;
        this._ws.close();
      } catch (error) {
        console.warn(this._logPrefix, "Offline close socket failed", error);
      }
    }
    this._ws = null;
    this._wsReady = false;
  }
  handleOnline() {
    if (!this._isOffline) return;
    this._isOffline = false;
    this._pendingFullReset = true;
    this._pendingFullResetReason = "network_online";
    this._wsReconnectAttempts = 0;
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    if (this.realtimeSubscriptions.size || this.quoteSubscriptions.size) {
      this._forceRealtimeReconnect("network_online");
    }
  }
  resetCache() {
    const previousSize = this.lastBarsCache.size;
    this.lastBarsCache.clear();
    this._quoteSubscribePending.clear();
    if (previousSize > 0) {
      console.info(this._logPrefix, `resetCache cleared ${previousSize} cached bars`);
    }
  }
  getCacheKey(symbolInfo, resolution) {
    const symbol = typeof symbolInfo === "string" ? symbolInfo : (symbolInfo == null ? void 0 : symbolInfo.ticker) || (symbolInfo == null ? void 0 : symbolInfo.name) || "";
    return `${symbol}__${resolution || ""}`;
  }
  setLastBarCache(key, bar) {
    if (!this.lastBarsCache.has(key) && this.lastBarsCache.size >= MAX_LAST_BARS_CACHE_SIZE) {
      const oldestKey = this.lastBarsCache.keys().next().value;
      this.lastBarsCache.delete(oldestKey);
      console.debug(this._logPrefix, "lastBarsCache evicted oldest entry:", oldestKey);
    }
    this.lastBarsCache.set(key, bar);
  }
  getLastBarCache(key) {
    return this.lastBarsCache.get(key);
  }
  deleteLastBarCache(key) {
    this.lastBarsCache.delete(key);
  }
  subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) {
    if (!symbolInfo) {
      console.error(this._logPrefix, "subscribeBars missing symbolInfo");
      return;
    }
    if (!subscriberUID) {
      console.error(this._logPrefix, "subscribeBars missing subscriberUID");
      return;
    }
    const symbol = symbolInfo.ticker || symbolInfo.name;
    const session = symbolInfo.subsession_id;
    console.info(this._logPrefix, "subscribeBars", { symbol, resolution, subscriberUID });
    const existing = this.realtimeSubscriptions.get(subscriberUID);
    if (existing) {
      const oldSession = existing == null ? void 0 : existing.session;
      const newSession = session;
      if (oldSession && newSession && oldSession !== newSession && typeof onResetCacheNeededCallback === "function") {
        onResetCacheNeededCallback();
      }
    }
    this.realtimeSubscriptions.set(subscriberUID, {
      symbol,
      resolution,
      session,
      subscriberUID,
      onRealtimeCallback,
      onResetCacheNeededCallback
    });
    this._syncedRealtimeSubscriptions.delete(subscriberUID);
    this._sendRealtimeMessage({
      type: "subscribe",
      symbol,
      resolution,
      session,
      subscriberUID
    });
    this._ensureRealtimeSocket();
  }
  unsubscribeBars(subscriberUID) {
    console.info(this._logPrefix, "unsubscribeBars", subscriberUID);
    const subscription = this.realtimeSubscriptions.get(subscriberUID);
    if (!subscription) return;
    const cacheKey = this.getCacheKey(subscription.symbol, subscription.resolution);
    if (cacheKey) {
      this.lastBarsCache.delete(cacheKey);
    }
    this.realtimeSubscriptions.delete(subscriberUID);
    this._syncedRealtimeSubscriptions.delete(subscriberUID);
    this._sendRealtimeMessage({ type: "unsubscribe", subscriberUID });
    if (!this._resubscribeInProgress && !this.realtimeSubscriptions.size && !this.quoteSubscriptions.size) {
      this._cleanupSocket();
    }
  }
  subscribeQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID) {
    const guid = typeof listenerGUID === "string" ? listenerGUID.trim() : "";
    if (!guid) {
      console.error(this._logPrefix, "subscribeQuotes missing listenerGUID");
      return;
    }
    const normalizedSymbols = normalizeQuoteList(symbols);
    const normalizedFastSymbols = normalizeQuoteList(fastSymbols);
    if (this._quoteSubscribePending.has(guid)) {
      console.debug(this._logPrefix, "subscribeQuotes: request pending for GUID, updating callback only:", guid);
      const existing2 = this.quoteSubscriptions.get(guid);
      if (existing2) {
        existing2.callback = onRealtimeCallback;
        existing2.symbols = new Set(normalizedSymbols);
        existing2.fastSymbols = new Set(normalizedFastSymbols);
      }
      return;
    }
    const existing = this.quoteSubscriptions.get(guid);
    if (existing) {
      const sameSymbols = this._getQuoteSubscriptionSignature({
        symbols: normalizedSymbols,
        fastSymbols: normalizedFastSymbols
      }) === this._getQuoteSubscriptionSignature(existing);
      if (sameSymbols) {
        console.debug(this._logPrefix, "subscribeQuotes: same subscription already exists for GUID:", guid);
        existing.callback = onRealtimeCallback;
        return;
      }
      console.info(this._logPrefix, "subscribeQuotes: updating existing subscription for GUID:", guid);
      this._sendRealtimeMessage({ type: "unsubscribe_quotes", listenerGUID: guid });
    }
    this._quoteSubscribePending.add(guid);
    this.quoteSubscriptions.set(guid, {
      listenerGUID: guid,
      symbols: new Set(normalizedSymbols),
      fastSymbols: new Set(normalizedFastSymbols),
      callback: onRealtimeCallback
    });
    const initialSymbols = Array.from(/* @__PURE__ */ new Set([...normalizedSymbols, ...normalizedFastSymbols]));
    if (initialSymbols.length && typeof this._fetchQuotes === "function") {
      this._fetchQuotes(initialSymbols, (quotes) => {
        try {
          onRealtimeCallback(quotes);
        } catch (error) {
          console.warn(this._logPrefix, "initial quote callback failed", error);
        }
      }, (error) => {
        console.warn(this._logPrefix, "initial getQuotes failed before subscribeQuotes", error);
      });
    }
    this._syncedQuoteSubscriptions.delete(guid);
    this._sendRealtimeMessage({
      type: "subscribe_quotes",
      listenerGUID: guid,
      symbols: normalizedSymbols,
      fastSymbols: normalizedFastSymbols
    });
    this._ensureRealtimeSocket();
  }
  unsubscribeQuotes(listenerGUID) {
    const guid = typeof listenerGUID === "string" ? listenerGUID.trim() : "";
    if (!guid) return;
    this.quoteSubscriptions.delete(guid);
    this._quoteSubscribePending.delete(guid);
    this._syncedQuoteSubscriptions.delete(guid);
    this._sendRealtimeMessage({ type: "unsubscribe_quotes", listenerGUID: guid });
    if (this.quoteSubscriptions.size === 0 && this.realtimeSubscriptions.size === 0) {
      this._cleanupSocket();
    }
  }
  _setConnectionState(newState, context = {}) {
    if (this._connectionState === newState) return;
    const oldState = this._connectionState;
    this._connectionState = newState;
    const logContext = __spreadValues({
      transition: `${oldState} -> ${newState}`,
      reconnectAttempts: this._wsReconnectAttempts,
      subscriptions: {
        realtime: this.realtimeSubscriptions.size,
        quote: this.quoteSubscriptions.size
      }
    }, context);
    console.info(this._logPrefix, "Connection state changed:", logContext);
    this._logDebugSnapshot("connection_state", {
      transition: `${oldState} -> ${newState}`
    });
    this._connectionStateListeners.forEach((listener) => {
      try {
        listener(newState, oldState);
      } catch (error) {
        console.error(this._logPrefix, "Connection state listener error:", error);
      }
    });
  }
  _getWsState() {
    if (!this._ws) return "closed";
    switch (this._ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "open";
      default:
        return "closed";
    }
  }
  _formatIso(ts) {
    return typeof ts === "number" && Number.isFinite(ts) ? new Date(ts).toISOString() : null;
  }
  _buildDebugSnapshot(extra = {}) {
    const lastConnectionReset = this._lastConnectionReset ? __spreadProps(__spreadValues({}, this._lastConnectionReset), { atIso: this._formatIso(this._lastConnectionReset.at) }) : null;
    const lastSubscriptionReset = this._lastSubscriptionReset ? __spreadProps(__spreadValues({}, this._lastSubscriptionReset), { atIso: this._formatIso(this._lastSubscriptionReset.at) }) : null;
    const authTokenRemainingMs = typeof this._authTokenExpMs === "number" ? this._authTokenExpMs - Date.now() : null;
    const authTokenRemainingMinutes = typeof authTokenRemainingMs === "number" ? Math.max(0, Math.ceil(authTokenRemainingMs / 6e4)) : null;
    return __spreadValues({
      wsState: this._getWsState(),
      connectionState: this._connectionState,
      lastPongAt: this._lastPongAt,
      lastPongAtIso: this._formatIso(this._lastPongAt),
      pingRttMs: this._lastPingRttMs,
      subscriptions: {
        bars: this.realtimeSubscriptions.size,
        quotes: this.quoteSubscriptions.size
      },
      authToken: {
        expMs: this._authTokenExpMs,
        expIso: this._formatIso(this._authTokenExpMs),
        remainingMs: authTokenRemainingMs,
        remainingMinutes: authTokenRemainingMinutes,
        refreshFailures: this._authTokenRefreshFailures,
        maxFailures: this._authTokenMaxFailures
      },
      lastConnectionReset,
      lastSubscriptionReset
    }, extra);
  }
  _logDebugSnapshot(event, extra = {}, level = "debug") {
    const logger = console[level] || console.debug;
    logger(this._logPrefix, "DebugState", __spreadValues({
      event,
      timestamp: Date.now()
    }, this._buildDebugSnapshot(extra)));
  }
  _notifyFullReset(info = {}) {
    this._fullResetListeners.forEach((listener) => {
      try {
        listener(info);
      } catch (error) {
        console.error(this._logPrefix, "Full reset listener error:", error);
      }
    });
  }
  _clearSyncedState() {
    this._syncedRealtimeSubscriptions.clear();
    this._syncedQuoteSubscriptions.clear();
  }
  _getRealtimeSubscriptionSignature(source) {
    const symbol = (source == null ? void 0 : source.symbol) || "";
    const resolution = (source == null ? void 0 : source.resolution) || "";
    const session = (source == null ? void 0 : source.session) || "";
    return `${symbol}__${resolution}__${session}`;
  }
  _getQuoteSubscriptionSignature(source) {
    const symbols = Array.isArray(source == null ? void 0 : source.symbols) ? source.symbols : Array.from((source == null ? void 0 : source.symbols) || []);
    const fastSymbols = Array.isArray(source == null ? void 0 : source.fastSymbols) ? source.fastSymbols : Array.from((source == null ? void 0 : source.fastSymbols) || []);
    const normalizedSymbols = Array.from(new Set(symbols.filter(Boolean))).sort();
    const normalizedFastSymbols = Array.from(new Set(fastSymbols.filter(Boolean))).sort();
    return `${normalizedSymbols.join(",")}__${normalizedFastSymbols.join(",")}`;
  }
  _trackSyncedSubscription(message) {
    switch (message == null ? void 0 : message.type) {
      case "subscribe": {
        const subscriberUID = message == null ? void 0 : message.subscriberUID;
        if (!subscriberUID) return;
        const signature = this._getRealtimeSubscriptionSignature(message);
        this._syncedRealtimeSubscriptions.set(subscriberUID, signature);
        break;
      }
      case "unsubscribe": {
        const subscriberUID = message == null ? void 0 : message.subscriberUID;
        if (!subscriberUID) return;
        this._syncedRealtimeSubscriptions.delete(subscriberUID);
        break;
      }
      case "subscribe_quotes": {
        const listenerGUID = message == null ? void 0 : message.listenerGUID;
        if (!listenerGUID) return;
        const signature = this._getQuoteSubscriptionSignature(message);
        this._syncedQuoteSubscriptions.set(listenerGUID, signature);
        break;
      }
      case "unsubscribe_quotes": {
        const listenerGUID = message == null ? void 0 : message.listenerGUID;
        if (!listenerGUID) return;
        this._syncedQuoteSubscriptions.delete(listenerGUID);
        break;
      }
      default:
        break;
    }
  }
  _ensureRealtimeSocket() {
    if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!this.realtimeSubscriptions.size && !this.quoteSubscriptions.size) return;
    if (this._isOffline || typeof navigator !== "undefined" && navigator.onLine === false) return;
    const url = buildRealtimeUrl(this.baseUrl);
    this._ws = new WebSocket(url);
    this._wsReady = false;
    this._setConnectionState(
      this._wsReconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING,
      { wsUrl: url, reason: "initiating_connection" }
    );
    this._ws.onopen = () => {
      console.info(this._logPrefix, "Realtime socket connected");
      this._wsReady = true;
      this._lastPongAt = Date.now();
      this._awaitingAdapterRecovery = false;
      const prevAttempts = this._wsReconnectAttempts;
      this._wsReconnectAttempts = 0;
      this._setConnectionState(ConnectionState.CONNECTED, {
        reason: "socket_opened",
        prevReconnectAttempts: prevAttempts
      });
      this._flushRealtimeQueue();
      const fullReset = this._pendingFullReset || this._hasConnectedOnce;
      const resetReason = fullReset ? this._pendingFullResetReason || (this._hasConnectedOnce ? "reconnect" : "initial_connect") : null;
      this._pendingFullReset = false;
      this._pendingFullResetReason = null;
      this._hasConnectedOnce = true;
      this._resubscribeAll({ fullReset, reason: resetReason });
      this._startHeartbeat();
    };
    this._ws.onmessage = (event) => this._handleRealtimeMessage(event);
    this._ws.onclose = () => {
      if (this._wsClosingIntentionally) {
        console.debug(this._logPrefix, "Realtime socket closed (intentional)");
        this._setConnectionState(ConnectionState.DISCONNECTED, {
          reason: "intentional_close"
        });
      } else {
        console.warn(this._logPrefix, "Realtime socket closed unexpectedly");
        this._setConnectionState(ConnectionState.RECONNECTING, {
          reason: "unexpected_close"
        });
      }
      this._wsReady = false;
      this._wsClosingIntentionally = false;
      this._stopHeartbeat();
      this._ws = null;
      this._clearSyncedState();
      this._scheduleReconnect();
    };
    this._ws.onerror = (error) => {
      console.error(this._logPrefix, "Realtime socket error:", error);
      this._setConnectionState(ConnectionState.ERROR, {
        reason: "socket_error",
        errorType: (error == null ? void 0 : error.type) || "unknown"
      });
    };
  }
  _handleRealtimeMessage(event) {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (error) {
      console.error(this._logPrefix, "Invalid realtime payload", error);
      return;
    }
    switch (payload == null ? void 0 : payload.type) {
      case "bar":
        this._handleIncomingBar(payload);
        break;
      case "quote":
        this._handleIncomingQuote(payload);
        break;
      case "error":
        console.error(this._logPrefix, "Realtime error", payload);
        if (payload.listenerGUID) {
          this._quoteSubscribePending.delete(payload.listenerGUID);
        }
        if (payload.code === "quote_subscribe_in_progress" && payload.listenerGUID) {
          const retryDelay = 500;
          console.info(this._logPrefix, `Will retry quote subscription for ${payload.listenerGUID} in ${retryDelay}ms`);
          setTimeout(() => {
            const sub = this.quoteSubscriptions.get(payload.listenerGUID);
            if (sub) {
              console.info(this._logPrefix, `Retrying quote subscription for ${payload.listenerGUID}`);
              this._quoteSubscribePending.add(payload.listenerGUID);
              this._sendRealtimeMessage({
                type: "subscribe_quotes",
                listenerGUID: payload.listenerGUID,
                symbols: Array.from(sub.symbols),
                fastSymbols: Array.from(sub.fastSymbols)
              });
            }
          }, retryDelay);
        }
        break;
      case "subscribed":
        console.debug(this._logPrefix, "Realtime subscribed", payload.subscriberUID);
        break;
      case "quote_subscribed":
        console.debug(this._logPrefix, "Realtime quotes subscribed", payload.listenerGUID);
        if (payload.listenerGUID) {
          this._quoteSubscribePending.delete(payload.listenerGUID);
        }
        break;
      case "adapter_status":
        this._handleAdapterStatus(payload);
        break;
      case "connection_status":
        this._handleConnectionStatus(payload);
        break;
      case "connection_reset":
        this._handleConnectionReset(payload);
        break;
      case "subscription_reset":
        this._handleSubscriptionReset(payload);
        break;
      case "system_warning":
        this._handleSystemWarning(payload);
        break;
      case "system_info":
        console.info(this._logPrefix, "System info:", payload.message, payload);
        break;
      case "pong":
        this._handlePong();
        break;
      case "hello":
        break;
      default:
        console.debug(this._logPrefix, "Realtime event", payload);
    }
  }
  _handleAdapterStatus(payload) {
    var _a;
    const status = payload == null ? void 0 : payload.status;
    if (!status) return;
    const expMs = Number(payload == null ? void 0 : payload.authTokenExpMs);
    if (Number.isFinite(expMs)) {
      this._authTokenExpMs = expMs;
    }
    if (Number.isFinite(payload == null ? void 0 : payload.authTokenRefreshFailures)) {
      this._authTokenRefreshFailures = payload.authTokenRefreshFailures;
    }
    if (Number.isFinite(payload == null ? void 0 : payload.authTokenMaxFailures)) {
      this._authTokenMaxFailures = payload.authTokenMaxFailures;
    } else if (Number.isFinite(payload == null ? void 0 : payload.maxFailures)) {
      this._authTokenMaxFailures = payload.maxFailures;
    }
    const authTokenRemainingMs = typeof this._authTokenExpMs === "number" ? this._authTokenExpMs - Date.now() : null;
    const authTokenRemainingMinutes = typeof authTokenRemainingMs === "number" ? Math.max(0, Math.ceil(authTokenRemainingMs / 6e4)) : null;
    console.warn(this._logPrefix, "Adapter status update:", status);
    this._logDebugSnapshot("adapter_status", {
      adapterStatus: status,
      reason: payload == null ? void 0 : payload.reason,
      suppressHandling: (payload == null ? void 0 : payload.suppressHandling) === true,
      authTokenRemainingMinutes
    });
    if (status === "error" && (payload == null ? void 0 : payload.reason) === "auth_token_refresh_failed") {
      console.error(this._logPrefix, "auth_token refresh failed threshold reached", {
        failures: payload == null ? void 0 : payload.authTokenRefreshFailures,
        maxFailures: (_a = payload == null ? void 0 : payload.authTokenMaxFailures) != null ? _a : payload == null ? void 0 : payload.maxFailures
      });
    }
    if ((payload == null ? void 0 : payload.suppressHandling) === true && status !== "error") {
      if (status === "connected") {
        this._awaitingAdapterRecovery = false;
        this._setConnectionState(ConnectionState.CONNECTED, {
          reason: (payload == null ? void 0 : payload.reason) || "adapter_status"
        });
      }
      return;
    }
    if (status === "disconnected" || status === "error") {
      this._awaitingAdapterRecovery = true;
      this._setConnectionState(ConnectionState.DEGRADED, {
        reason: "adapter_status",
        adapterStatus: status
      });
      return;
    }
    if (status === "connecting") {
      this._setConnectionState(ConnectionState.RECONNECTING, {
        reason: "adapter_status",
        adapterStatus: status
      });
      return;
    }
    if (status === "connected") {
      const shouldResubscribe = this._awaitingAdapterRecovery || (payload == null ? void 0 : payload.reset);
      this._awaitingAdapterRecovery = false;
      this._setConnectionState(ConnectionState.CONNECTED, {
        reason: "adapter_recovered"
      });
      if (shouldResubscribe) {
        console.info(this._logPrefix, "Adapter recovered, resubscribing all data");
        this._resubscribeAll({ fullReset: true, reason: "adapter_recovered" });
      }
    }
  }
  _handleConnectionStatus(payload) {
    const status = payload == null ? void 0 : payload.status;
    if (!status) return;
    if (status === "upstream_disconnected") {
      this._awaitingAdapterRecovery = true;
      this._setConnectionState(ConnectionState.DEGRADED, {
        reason: "upstream_disconnected"
      });
      return;
    }
    if (status === "reconnecting") {
      this._setConnectionState(ConnectionState.RECONNECTING, {
        reason: "upstream_reconnecting"
      });
    }
  }
  _handleConnectionReset(payload) {
    if (this._resubscribeInProgress) return;
    const reason = (payload == null ? void 0 : payload.reason) || "connection_reset";
    this._lastConnectionReset = {
      reason,
      at: Date.now()
    };
    console.warn(this._logPrefix, "Server connection reset:", reason);
    this._logDebugSnapshot("connection_reset", { reason }, "info");
    this._resubscribeAll({ fullReset: true, reason });
  }
  _handleSubscriptionReset(payload) {
    const reason = (payload == null ? void 0 : payload.reason) || "subscription_reset";
    this._lastSubscriptionReset = {
      reason,
      at: Date.now(),
      subscriberUID: payload == null ? void 0 : payload.subscriberUID,
      symbol: payload == null ? void 0 : payload.symbol,
      resolution: payload == null ? void 0 : payload.resolution
    };
    console.warn(this._logPrefix, "Subscription reset:", reason, payload);
    this._logDebugSnapshot("subscription_reset", {
      reason,
      subscriberUID: payload == null ? void 0 : payload.subscriberUID,
      symbol: payload == null ? void 0 : payload.symbol,
      resolution: payload == null ? void 0 : payload.resolution
    }, "info");
    const subscriberUID = payload == null ? void 0 : payload.subscriberUID;
    if (!subscriberUID) return;
    const subscription = this.realtimeSubscriptions.get(subscriberUID);
    if (!subscription) return;
    const cacheKey = this.getCacheKey(subscription.symbol, subscription.resolution);
    if (cacheKey) {
      this.lastBarsCache.delete(cacheKey);
    }
    if (typeof subscription.onResetCacheNeededCallback === "function") {
      try {
        subscription.onResetCacheNeededCallback();
      } catch (error) {
        console.error(this._logPrefix, `Error invoking reset cache callback for ${subscriberUID}:`, error);
      }
    }
    if (!this.realtimeSubscriptions.has(subscriberUID)) {
      this.realtimeSubscriptions.set(subscriberUID, subscription);
    }
    this._syncedRealtimeSubscriptions.delete(subscriberUID);
    this._syncDesiredState({
      reason,
      reconnect: true,
      onlySubscriberUIDs: [subscriberUID]
    });
  }
  _handlePong() {
    this._lastPongAt = Date.now();
    if (typeof this._lastPingSentAt === "number" && this._lastPingSentAt > 0) {
      this._lastPingRttMs = Math.max(0, this._lastPongAt - this._lastPingSentAt);
    }
    this._logDebugSnapshot("pong");
  }
  _forceRealtimeReconnect(reason) {
    if (!this._ws) {
      this._pendingFullReset = true;
      this._pendingFullResetReason = reason || "force_reconnect";
      this._scheduleReconnect();
      return;
    }
    console.warn(this._logPrefix, `Force realtime reconnect (${reason})`);
    this._pendingFullReset = true;
    this._pendingFullResetReason = reason || "force_reconnect";
    this._cleanupSocket();
    this._scheduleReconnect();
  }
  _handleSystemWarning(payload) {
    const { warningId, requiresAck, state, message, retry, finalAttempt } = payload;
    if (finalAttempt) {
      console.warn(this._logPrefix, "System warning (final attempt):", message, { state, warningId });
    } else if (retry) {
      console.warn(this._logPrefix, `System warning (retry ${retry}):`, message, { state, warningId });
    } else {
      console.warn(this._logPrefix, "System warning:", message, { state, warningId });
    }
    if (requiresAck && warningId) {
      this._sendAck(warningId);
    }
    if (typeof this._onSystemWarning === "function") {
      this._onSystemWarning({ state, message, warningId });
    }
  }
  _sendAck(warningId) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      try {
        this._ws.send(JSON.stringify({
          type: "ack_warning",
          warningId
        }));
        console.debug(this._logPrefix, "Sent warning ACK:", warningId);
      } catch (error) {
        console.error(this._logPrefix, "Failed to send warning ACK:", error);
      }
    }
  }
  _handleIncomingBar(payload) {
    const { subscriberUID, bar } = payload;
    if (!subscriberUID || !bar) return;
    const subscription = this.realtimeSubscriptions.get(subscriberUID);
    if (!subscription) return;
    const formattedBar = formatRealtimeBar(bar);
    const cacheKey = this.getCacheKey(subscription.symbol, subscription.resolution);
    const lastBar = this.lastBarsCache.get(cacheKey);
    if (lastBar && typeof lastBar.time === "number") {
      if (formattedBar.time < lastBar.time) {
        console.debug(this._logPrefix, "Ignoring outdated bar update", {
          subscriberUID,
          receivedTime: formattedBar.time,
          cachedTime: lastBar.time
        });
        return;
      }
      if (formattedBar.time === lastBar.time) {
        if (floatEquals(formattedBar.open, lastBar.open) && floatEquals(formattedBar.high, lastBar.high) && floatEquals(formattedBar.low, lastBar.low) && floatEquals(formattedBar.close, lastBar.close) && floatEquals(formattedBar.volume, lastBar.volume)) {
          return;
        }
      }
    }
    this.setLastBarCache(cacheKey, formattedBar);
    if (typeof subscription.onRealtimeCallback === "function") {
      subscription.onRealtimeCallback(formattedBar);
    }
    if (this._broker && typeof this._broker.updateQuotes === "function" && formattedBar.close) {
      this._broker.updateQuotes(subscription.symbol, {
        bid: formattedBar.close,
        ask: formattedBar.close,
        lp: formattedBar.close
      });
    }
  }
  _handleIncomingQuote(payload) {
    var _a, _b, _c, _d, _e, _f;
    const { listenerGUID, quotes } = payload;
    if (!listenerGUID || !Array.isArray(quotes)) return;
    const subscription = this.quoteSubscriptions.get(listenerGUID);
    if (!subscription || typeof subscription.callback !== "function") return;
    try {
      subscription.callback(quotes);
      if (this._broker && typeof this._broker.updateQuotes === "function") {
        for (const quote of quotes) {
          if (quote.n && (((_a = quote.v) == null ? void 0 : _a.bid) !== void 0 || ((_b = quote.v) == null ? void 0 : _b.ask) !== void 0 || ((_c = quote.v) == null ? void 0 : _c.lp) !== void 0)) {
            this._broker.updateQuotes(quote.n, {
              bid: (_d = quote.v) == null ? void 0 : _d.bid,
              ask: (_e = quote.v) == null ? void 0 : _e.ask,
              lp: (_f = quote.v) == null ? void 0 : _f.lp
            });
          }
        }
      }
    } catch (error) {
      console.error(this._logPrefix, "quote callback error", error);
    }
  }
  _sendRealtimeMessage(message) {
    if (!message) return;
    const serialized = JSON.stringify(message);
    const isSubscriptionMessage = SUBSCRIPTION_MESSAGE_TYPES.has(message.type);
    if (this._wsReady && this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(serialized);
      if (isSubscriptionMessage) {
        this._trackSyncedSubscription(message);
      }
      return;
    }
    if (isSubscriptionMessage) {
      return;
    }
    const currentPriority = MESSAGE_PRIORITY[message.type] || MESSAGE_PRIORITY.default;
    if (this._wsQueue.length >= MAX_WS_QUEUE_SIZE) {
      let lowestPriorityIndex = -1;
      let lowestPriority = currentPriority;
      for (let i = 0; i < this._wsQueue.length; i++) {
        const queuedItem = this._wsQueue[i];
        try {
          const parsed = JSON.parse(queuedItem.data || queuedItem);
          const itemPriority = MESSAGE_PRIORITY[parsed.type] || MESSAGE_PRIORITY.default;
          if (itemPriority < lowestPriority) {
            lowestPriority = itemPriority;
            lowestPriorityIndex = i;
          }
        } catch (e) {
          lowestPriorityIndex = i;
          lowestPriority = 0;
          break;
        }
      }
      if (lowestPriorityIndex >= 0) {
        this._wsQueue.splice(lowestPriorityIndex, 1);
        console.warn(this._logPrefix, `Message queue overflow, discarded lower priority message (priority ${lowestPriority})`);
      } else {
        if (currentPriority >= 3) {
          for (let i = 0; i < this._wsQueue.length; i++) {
            try {
              const parsed = JSON.parse(this._wsQueue[i].data || this._wsQueue[i]);
              const itemPriority = MESSAGE_PRIORITY[parsed.type] || MESSAGE_PRIORITY.default;
              if (itemPriority < 3) {
                this._wsQueue.splice(i, 1);
                console.warn(this._logPrefix, "High priority message forcing out lower priority message");
                break;
              }
            } catch (e) {
              this._wsQueue.splice(i, 1);
              break;
            }
          }
        } else {
          console.warn(this._logPrefix, `Message queue full, dropping current message (type: ${message.type}, priority ${currentPriority})`);
          return;
        }
      }
    }
    this._wsQueue.push({
      data: serialized,
      priority: currentPriority,
      timestamp: Date.now()
    });
    this._ensureRealtimeSocket();
  }
  _flushRealtimeQueue() {
    if (!this._wsReady || !this._ws) return;
    while (this._wsQueue.length) {
      const item = this._wsQueue.shift();
      const payload = typeof item === "object" && item.data ? item.data : item;
      try {
        this._ws.send(payload);
      } catch (error) {
        console.error(this._logPrefix, "Failed to send realtime payload", error);
        break;
      }
    }
  }
  _resubscribeAll(options = {}) {
    const fullReset = options.fullReset === true;
    const resetReason = fullReset ? options.reason || "reconnect" : null;
    console.info(this._logPrefix, "Resubscribing all after reconnect...");
    this._resubscribeInProgress = true;
    try {
      if (fullReset) {
        this._notifyFullReset({
          reason: resetReason,
          timestamp: Date.now()
        });
      }
      const barsSnapshot = new Map(this.realtimeSubscriptions);
      const quotesSnapshot = new Map(this.quoteSubscriptions);
      console.debug(this._logPrefix, `Saved subscriptions snapshot: ${barsSnapshot.size} bars, ${quotesSnapshot.size} quotes`);
      if (fullReset) {
        const previousSize = this.lastBarsCache.size;
        this.lastBarsCache.clear();
        this._quoteSubscribePending.clear();
        if (previousSize > 0) {
          console.info(this._logPrefix, `Cleared ${previousSize} cached bars due to full reset`);
        }
      } else {
        let clearedCount = 0;
        const activeKeys = /* @__PURE__ */ new Set();
        barsSnapshot.forEach((subscription) => {
          const cacheKey = this.getCacheKey(subscription.symbol, subscription.resolution);
          activeKeys.add(cacheKey);
        });
        activeKeys.forEach((key) => {
          if (this.lastBarsCache.has(key)) {
            this.lastBarsCache.delete(key);
            clearedCount++;
          }
        });
        if (clearedCount > 0) {
          console.info(this._logPrefix, `Cleared ${clearedCount} active subscription caches, retained ${this.lastBarsCache.size} inactive caches`);
        }
      }
      barsSnapshot.forEach((subscription, subscriberUID) => {
        if (typeof subscription.onResetCacheNeededCallback === "function") {
          try {
            subscription.onResetCacheNeededCallback();
            console.debug(this._logPrefix, `Reset cache callback invoked for ${subscriberUID}`);
          } catch (error) {
            console.error(this._logPrefix, `Error invoking reset cache callback for ${subscriberUID}:`, error);
          }
        }
        if (!this.realtimeSubscriptions.has(subscriberUID)) {
          console.debug(this._logPrefix, `Re-adding subscription for ${subscriberUID} (was removed by resetCacheCallback)`);
          this.realtimeSubscriptions.set(subscriberUID, subscription);
        }
      });
      quotesSnapshot.forEach((subscription, listenerGUID) => {
        if (!this.quoteSubscriptions.has(listenerGUID)) {
          console.debug(this._logPrefix, `Re-adding quote subscription for ${listenerGUID}`);
          this.quoteSubscriptions.set(listenerGUID, subscription);
        }
      });
      this._clearSyncedState();
      this._syncDesiredState({
        barsSnapshot,
        quotesSnapshot,
        reason: resetReason,
        reconnect: true
      });
      console.info(this._logPrefix, `Resubscribed ${barsSnapshot.size} bars and ${quotesSnapshot.size} quotes`);
    } finally {
      this._resubscribeInProgress = false;
      if (this.realtimeSubscriptions.size === 0 && this.quoteSubscriptions.size === 0) {
        console.info(this._logPrefix, "No active subscriptions after resubscribe, cleaning up socket");
        this._cleanupSocket();
      }
    }
  }
  _syncDesiredState({ barsSnapshot, quotesSnapshot, reconnect = false, reason = null, onlySubscriberUIDs = null } = {}) {
    const barsSource = barsSnapshot || this.realtimeSubscriptions;
    const quotesSource = quotesSnapshot || this.quoteSubscriptions;
    const onlySubscriberSet = Array.isArray(onlySubscriberUIDs) ? new Set(onlySubscriberUIDs) : null;
    barsSource.forEach((subscription, subscriberUID) => {
      if (onlySubscriberSet && !onlySubscriberSet.has(subscriberUID)) return;
      const signature = this._getRealtimeSubscriptionSignature(subscription);
      const previousSignature = this._syncedRealtimeSubscriptions.get(subscriberUID);
      if (reconnect || signature !== previousSignature) {
        this._sendRealtimeMessage({
          type: "subscribe",
          symbol: subscription.symbol,
          resolution: subscription.resolution,
          session: subscription.session,
          subscriberUID,
          reason
        });
      }
    });
    quotesSource.forEach((subscription, listenerGUID) => {
      const signature = this._getQuoteSubscriptionSignature(subscription);
      const previousSignature = this._syncedQuoteSubscriptions.get(listenerGUID);
      if (reconnect || signature !== previousSignature) {
        this._sendRealtimeMessage({
          type: "subscribe_quotes",
          listenerGUID,
          symbols: Array.from(subscription.symbols),
          fastSymbols: Array.from(subscription.fastSymbols),
          reason
        });
      }
    });
  }
  _scheduleReconnect() {
    if (this._wsReconnectTimer || !this.realtimeSubscriptions.size && !this.quoteSubscriptions.size) return;
    if (this._isOffline || typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (this._wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(this._logPrefix, `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up`);
      return;
    }
    const delay = Math.min(
      REALTIME_RECONNECT_BASE_DELAY_MS * Math.pow(REALTIME_RECONNECT_BACKOFF_FACTOR, this._wsReconnectAttempts),
      REALTIME_RECONNECT_MAX_DELAY_MS
    );
    this._wsReconnectAttempts++;
    console.info(this._logPrefix, `Scheduling reconnect attempt ${this._wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay)}ms`);
    this._wsReconnectTimer = setTimeout(() => {
      this._wsReconnectTimer = null;
      if (this.realtimeSubscriptions.size || this.quoteSubscriptions.size) {
        console.info(this._logPrefix, "Attempting realtime reconnect...");
        this._ensureRealtimeSocket();
      }
    }, delay);
  }
  _cleanupSocket() {
    this._stopHeartbeat();
    if (this._ws) {
      try {
        this._wsClosingIntentionally = true;
        this._ws.close();
      } catch (error) {
        console.error(this._logPrefix, "Failed to close realtime socket", error);
        this._wsClosingIntentionally = false;
      }
    }
    this._ws = null;
    this._wsReady = false;
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    this._wsQueue = [];
    this._wsReconnectAttempts = 0;
    this._clearSyncedState();
  }
  _startHeartbeat() {
    if (this._heartbeatTimer) return;
    this._lastPongAt = Date.now();
    this._heartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (this._wsReady && now - this._lastPongAt > CLIENT_PONG_TIMEOUT_MS) {
        console.warn(this._logPrefix, "Realtime pong timeout, reconnecting", {
          lastPongDelta: now - this._lastPongAt,
          threshold: CLIENT_PONG_TIMEOUT_MS
        });
        this._forceRealtimeReconnect("pong_timeout");
        return;
      }
      this._lastPingSentAt = now;
      this._sendRealtimeMessage({ type: "ping", timestamp: now });
    }, HEARTBEAT_INTERVAL_MS);
  }
  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
  destroy() {
    console.info(this._logPrefix, "Destroying realtime client");
    this._cleanupSocket();
    this.realtimeSubscriptions.clear();
    this.quoteSubscriptions.clear();
    this.lastBarsCache.clear();
    this._quoteSubscribePending.clear();
    this._connectionStateListeners.clear();
    this._fullResetListeners.clear();
    this._setConnectionState(ConnectionState.DISCONNECTED, { reason: "instance_destroyed" });
  }
};

// src/datafeed/udf-http-client.js
var RequestDeduplicator = class {
  constructor() {
    this._pending = /* @__PURE__ */ new Map();
  }
  /**
   * 去重执行异步函数
   * @param {string} key - 请求唯一标识
   * @param {Function} fn - 异步函数
   * @returns {Promise}
   */
  dedupe(key, fn) {
    return __async(this, null, function* () {
      if (this._pending.has(key)) {
        return this._pending.get(key);
      }
      const promise = fn().finally(() => {
        this._pending.delete(key);
      });
      this._pending.set(key, promise);
      return promise;
    });
  }
  /**
   * 取消指定请求
   */
  cancel(key) {
    this._pending.delete(key);
  }
  /**
   * 清空所有待处理请求
   */
  clear() {
    this._pending.clear();
  }
  /**
   * 获取待处理请求数量
   */
  get size() {
    return this._pending.size;
  }
};
function isRetryableError(error, response = null, retryableStatusCodes = []) {
  if (!error) return false;
  if (response && retryableStatusCodes.includes(response.status)) {
    return true;
  }
  const retryableErrors = ["NetworkError", "TypeError", "AbortError"];
  return retryableErrors.includes(error.name);
}
function getRetryDelay(attempt, baseDelay = 500, maxDelay = 5e3, backoffFactor = 2) {
  const delay = baseDelay * Math.pow(backoffFactor, attempt);
  return Math.min(delay, maxDelay);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function buildQuery(params) {
  if (!params || typeof params !== "object") return "";
  return Object.entries(params).map(([key, value]) => {
    if (value === void 0 || value === null) return null;
    return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }).filter(Boolean).join("&");
}
var UdfHttpClient = class {
  constructor({ baseUrl, logPrefix: logPrefix2 = "[UdfHttpClient]", retryConfig = {} } = {}) {
    this._baseUrl = (baseUrl || "").replace(/\/$/, "");
    this._logPrefix = logPrefix2;
    this._deduplicator = new RequestDeduplicator();
    this._retryConfig = {
      maxAttempts: retryConfig.maxAttempts || 3,
      baseDelay: retryConfig.baseDelay || 500,
      maxDelay: retryConfig.maxDelay || 5e3,
      backoffFactor: retryConfig.backoffFactor || 2,
      retryableStatusCodes: retryConfig.retryableStatusCodes || [502, 503, 504, 429]
    };
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      lastRequestTime: null
    };
  }
  /**
   * 获取请求统计
   */
  getStats() {
    return __spreadValues({}, this._stats);
  }
  /**
   * 清理去重器
   */
  clear() {
    this._deduplicator.clear();
  }
  /**
   * 发起 HTTP 请求（带重试和去重）
   * @param {string} endpoint - API 端点
   * @param {Object} params - 查询参数
   * @param {Object} options - 选项
   * @param {number} options.timeout - 超时时间 (ms)
   * @param {boolean} options.retry - 是否启用重试 (默认 true)
   * @param {boolean} options.dedupe - 是否启用去重 (默认 true)
   * @param {string} options.responseType - 响应类型 ('json' | 'text')
   */
  request(_0) {
    return __async(this, arguments, function* (endpoint, params = {}, options = {}) {
      const queryString = buildQuery(params);
      const url = queryString ? `${this._baseUrl}${endpoint}?${queryString}` : `${this._baseUrl}${endpoint}`;
      const timeoutMs = options.timeout || 1e4;
      const enableDedupe = options.dedupe !== false;
      const method = options.method || "GET";
      const dedupeKey = `${method}:${url}`;
      const enableRetry = options.retry !== false;
      const maxAttempts = enableRetry ? this._retryConfig.maxAttempts : 1;
      const retryConfig = this._retryConfig;
      const stats = this._stats;
      const logPrefix2 = this._logPrefix;
      stats.totalRequests++;
      stats.lastRequestTime = Date.now();
      function shouldRetry(error, response, attempt) {
        if (!enableRetry) return false;
        if (attempt >= maxAttempts - 1) return false;
        return isRetryableError(error, response, retryConfig.retryableStatusCodes);
      }
      function doRequest() {
        return __async(this, null, function* () {
          let lastError = null;
          let response = null;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              if (attempt > 0) {
                const delay = getRetryDelay(attempt - 1, retryConfig.baseDelay, retryConfig.maxDelay, retryConfig.backoffFactor);
                console.info(logPrefix2, `Retry ${attempt}/${maxAttempts - 1} after ${delay}ms for ${endpoint}`);
                stats.retriedRequests++;
                yield sleep(delay);
              }
              console.debug(logPrefix2, "Requesting:", url, attempt > 0 ? `(attempt ${attempt + 1})` : "");
              response = yield fetch(url, __spreadValues({
                signal: controller.signal
              }, options.fetchOptions));
              clearTimeout(timeoutId);
              if (!response.ok) {
                const error = new Error(`HTTP ${response.status} for ${url}`);
                error.status = response.status;
                if (shouldRetry(error, response, attempt)) {
                  lastError = error;
                  continue;
                }
                console.error(logPrefix2, "Request failed:", error);
                stats.failedRequests++;
                throw error;
              }
              const payload = options.responseType === "text" ? yield response.text() : yield response.json();
              console.debug(logPrefix2, "Response:", typeof payload === "object" ? "[object]" : payload);
              stats.successfulRequests++;
              return payload;
            } catch (error) {
              if ((error == null ? void 0 : error.name) === "AbortError") {
                lastError = new Error(`Request timeout after ${timeoutMs}ms for ${endpoint}`);
                lastError.name = "AbortError";
                if (shouldRetry(lastError, response, attempt)) {
                  console.warn(logPrefix2, `Request timeout, will retry (${attempt + 1}/${maxAttempts})`);
                  continue;
                }
              } else {
                lastError = error;
                if (shouldRetry(lastError, response, attempt)) {
                  continue;
                }
              }
              console.error(logPrefix2, lastError.message);
              stats.failedRequests++;
              throw lastError;
            } finally {
              clearTimeout(timeoutId);
            }
          }
          stats.failedRequests++;
          throw lastError;
        });
      }
      if (enableDedupe) {
        return this._deduplicator.dedupe(dedupeKey, doRequest);
      }
      return doRequest();
    });
  }
};

// src/datafeed/tradingview-datafeed.js
function getDefaultApiBaseUrl() {
  if (window.__API_BASE_URL__) return window.__API_BASE_URL__;
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  if (isLocalhost) {
    return `http://${hostname}:3001`;
  }
  return window.location.origin;
}
var API_BASE_URL = getDefaultApiBaseUrl();
var TIMEOUTS = {
  config: 5e3,
  resolveSymbol: 15e3,
  getBars: 3e4,
  quotes: 1e4,
  search: 1e4,
  serverTime: 3e3,
  timescaleMarks: 5e3,
  default: 1e4
};
var RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelay: 500,
  maxDelay: 5e3,
  backoffFactor: 2,
  retryableErrors: ["NetworkError", "TypeError", "AbortError"],
  retryableStatusCodes: [502, 503, 504, 429]
};
var DEFAULT_CONFIGURATION = {
  supported_resolutions: ["1", "5", "15", "30", "60", "120", "240", "1D"],
  supports_search: true,
  supports_group_request: false,
  supports_marks: false,
  supports_timescale_marks: true,
  supports_time: true,
  symbols_grouping: {
    futures: /^([A-Z0-9]{1,5}?)([FGHJKMNQUVXZ](?:\d{1,4})|\d!?)$/
  }
};
var OFFLINE_PLACEHOLDER_SYMBOL = "OFFLINE:OFFLINE";
var logPrefix = "[TradingViewDatafeed]";
function buildOfflineSymbolInfo() {
  return {
    name: OFFLINE_PLACEHOLDER_SYMBOL,
    ticker: OFFLINE_PLACEHOLDER_SYMBOL,
    description: "Offline placeholder symbol",
    type: "stock",
    exchange: "OFFLINE",
    session: "24x7",
    timezone: "Etc/UTC",
    minmov: 1,
    minmov2: 0,
    pointvalue: 1,
    pricescale: 100,
    has_intraday: true,
    has_daily: true,
    has_weekly_and_monthly: true,
    supported_resolutions: DEFAULT_CONFIGURATION.supported_resolutions,
    visible_plots_set: "c",
    format: "price"
  };
}
function buildQuoteRequestPayload(symbols) {
  if (!Array.isArray(symbols)) return [];
  return symbols.map((entry) => {
    if (typeof entry === "string") {
      const symbol = entry.trim();
      return symbol.length ? symbol : null;
    }
    if (entry && typeof entry === "object") {
      const symbolName = normalizeQuoteEntry(entry);
      if (!symbolName) return null;
      const payload = { symbol: symbolName };
      if (typeof entry.session === "string" && entry.session.trim().length) {
        payload.session = entry.session.trim();
      }
      return payload;
    }
    return null;
  }).filter(Boolean);
}
var TradingViewDatafeed = class {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.configuration = null;
    this._configPromise = null;
    this._broker = null;
    this._resolveErrorListeners = /* @__PURE__ */ new Set();
    this._pendingSymbolForResolve = null;
    this._timescaleMarksCache = /* @__PURE__ */ new Map();
    this._timescaleMarksCacheTTL = 5 * 60 * 1e3;
    this._http = new UdfHttpClient({
      baseUrl: this.baseUrl,
      logPrefix,
      retryConfig: RETRY_CONFIG
    });
    this._realtime = new RealtimeClient({
      baseUrl: this.baseUrl,
      logPrefix,
      fetchQuotes: this.getQuotes.bind(this)
    });
    this._realtime.setSystemWarningHandler((payload) => {
      if (typeof this._onSystemWarning === "function") {
        this._onSystemWarning(payload);
      }
    });
    this.lastBarsCache = this._realtime.lastBarsCache;
    this.realtimeSubscriptions = this._realtime.realtimeSubscriptions;
    this.quoteSubscriptions = this._realtime.quoteSubscriptions;
    this._onlineListener = this._handleOnline.bind(this);
    this._offlineListener = this._handleOffline.bind(this);
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", this._onlineListener);
      window.addEventListener("offline", this._offlineListener);
    }
    console.info(logPrefix, "Initialized with baseUrl:", this.baseUrl);
  }
  get connectionState() {
    return this._realtime.connectionState;
  }
  onConnectionStateChange(listener) {
    return this._realtime.onConnectionStateChange(listener);
  }
  onFullReset(listener) {
    return this._realtime.onFullReset(listener);
  }
  onResolveError(listener) {
    this._resolveErrorListeners.add(listener);
    return () => this._resolveErrorListeners.delete(listener);
  }
  _notifyResolveError(info = {}) {
    for (const listener of this._resolveErrorListeners) {
      try {
        listener(info);
      } catch (error) {
        console.error(logPrefix, "Resolve error listener error:", error);
      }
    }
  }
  _handleOffline() {
    this._realtime.handleOffline();
  }
  _handleOnline() {
    this._realtime.handleOnline();
  }
  getStats() {
    return this._http.getStats();
  }
  setBroker(broker) {
    this._broker = broker;
    this._realtime.setBroker(broker);
    console.info(logPrefix, "Broker instance set");
  }
  _request(_0) {
    return __async(this, arguments, function* (endpoint, params = {}, options = {}) {
      return this._http.request(endpoint, params, options);
    });
  }
  onReady(callback) {
    console.info(logPrefix, "onReady triggered");
    this._ensureConfiguration().then((config) => {
      setTimeout(() => callback(config), 0);
    }).catch((error) => {
      console.error(logPrefix, "Failed to load configuration, fallback to defaults", error);
      const fallback = __spreadValues({}, DEFAULT_CONFIGURATION);
      this.configuration = fallback;
      setTimeout(() => callback(fallback), 0);
    });
  }
  _ensureConfiguration() {
    return __async(this, null, function* () {
      if (this.configuration) return this.configuration;
      if (!this._configPromise) {
        this._configPromise = this._request("/api/datafeed/config", {}, {
          timeout: TIMEOUTS.config,
          retry: true
        }).then((config) => {
          const normalized = __spreadValues(__spreadValues({}, DEFAULT_CONFIGURATION), config || {});
          this.configuration = normalized;
          this._configPromise = null;
          return normalized;
        }).catch((error) => {
          this._configPromise = null;
          throw error;
        });
      }
      return this._configPromise;
    });
  }
  searchSymbols(userInput, exchange, symbolType, onResultReadyCallback) {
    return __async(this, null, function* () {
      console.info(logPrefix, "searchSymbols", { userInput, exchange, symbolType });
      try {
        const data = yield this._request("/api/datafeed/search", {
          query: userInput || "",
          exchange: exchange || "",
          type: symbolType || ""
        }, {
          timeout: TIMEOUTS.search,
          retry: true
        });
        const results = Array.isArray(data) ? data : [];
        console.info(logPrefix, "searchSymbols results:", results.length);
        onResultReadyCallback(results);
      } catch (error) {
        console.error(logPrefix, "searchSymbols failed:", error);
        onResultReadyCallback([]);
      }
    });
  }
  searchSymbolsFull(userInput = "", symbolType = "", offset = 0) {
    return __async(this, null, function* () {
      try {
        const payload = yield this._request("/api/datafeed/search/full", {
          query: userInput,
          type: symbolType,
          offset
        }, {
          timeout: TIMEOUTS.search,
          retry: true
        });
        if (payload && typeof payload === "object" && Array.isArray(payload.symbols)) {
          return payload;
        }
        if (Array.isArray(payload)) {
          return { symbols_remaining: 0, symbols: payload };
        }
        return { symbols_remaining: 0, symbols: [] };
      } catch (error) {
        console.error(logPrefix, "searchSymbolsFull failed:", error);
        return { symbols_remaining: 0, symbols: [] };
      }
    });
  }
  resolveSymbol(symbolName, onSymbolResolvedCallback, onResolveErrorCallback, extension) {
    return __async(this, null, function* () {
      const sessionType = extension == null ? void 0 : extension.session;
      console.info(logPrefix, "resolveSymbol", symbolName, "session:", sessionType || "default");
      try {
        const normalizedSymbol = typeof symbolName === "string" ? symbolName.trim() : "";
        const isOffline = this._realtime.isOffline || typeof navigator !== "undefined" && navigator.onLine === false;
        if (normalizedSymbol === OFFLINE_PLACEHOLDER_SYMBOL) {
          onSymbolResolvedCallback(buildOfflineSymbolInfo());
          return;
        }
        if (isOffline) {
          this._pendingSymbolForResolve = normalizedSymbol || symbolName;
          this._notifyResolveError({
            symbol: normalizedSymbol || symbolName,
            error: new Error("offline"),
            isOffline: true,
            status: null,
            code: "offline"
          });
          if (typeof onResolveErrorCallback === "function") {
            onResolveErrorCallback("offline");
          }
          return;
        }
        const params = { symbol: symbolName };
        if (sessionType) {
          params.session = sessionType;
        }
        const data = yield this._request("/api/datafeed/symbols", params, {
          timeout: TIMEOUTS.resolveSymbol,
          retry: true,
          dedupe: true
        });
        if (!data || data.s === "error") {
          throw new Error((data == null ? void 0 : data.errmsg) || "Symbol not found");
        }
        console.info(logPrefix, "resolveSymbol success");
        if (this._broker && typeof this._broker.setSymbolInfo === "function") {
          this._broker.setSymbolInfo(symbolName, data);
          console.info(logPrefix, "Symbol info passed to broker, pointvalue:", data.pointvalue);
        }
        onSymbolResolvedCallback(data);
      } catch (error) {
        console.error(logPrefix, "resolveSymbol failed:", error);
        const isOffline = this._realtime.isOffline || typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline || (error == null ? void 0 : error.status) === 503) {
          this._pendingSymbolForResolve = symbolName;
        }
        this._notifyResolveError({
          symbol: symbolName,
          error,
          isOffline,
          status: error == null ? void 0 : error.status,
          code: (error == null ? void 0 : error.code) || "resolve_error",
          name: error == null ? void 0 : error.name
        });
        if (typeof onResolveErrorCallback === "function") {
          onResolveErrorCallback((error == null ? void 0 : error.message) || "resolve_error");
        }
      }
    });
  }
  getServerTime(callback) {
    console.info(logPrefix, "getServerTime");
    this._request("/api/datafeed/time", {}, {
      responseType: "text",
      timeout: TIMEOUTS.serverTime,
      retry: false,
      dedupe: false
    }).then((data) => {
      const serverTime = parseInt(data, 10);
      if (Number.isFinite(serverTime) && serverTime > 0) {
        callback(serverTime);
      } else {
        callback(Math.floor(Date.now() / 1e3));
      }
    }).catch((error) => {
      console.warn(logPrefix, "getServerTime failed, using local time", error);
      callback(Math.floor(Date.now() / 1e3));
    });
  }
  resetCache() {
    var _a;
    this._realtime.resetCache();
    (_a = this._timescaleMarksCache) == null ? void 0 : _a.clear();
    this._http.clear();
  }
  consumePendingSymbol() {
    const symbol = this._pendingSymbolForResolve;
    this._pendingSymbolForResolve = null;
    return symbol;
  }
  _convertToTopStepXSymbol(tvSymbol) {
    if (!tvSymbol) return null;
    let baseSymbol = tvSymbol;
    if (tvSymbol.includes(":")) {
      baseSymbol = tvSymbol.split(":")[1];
    }
    baseSymbol = baseSymbol.replace(/\d+!?$/, "");
    if (!baseSymbol) return null;
    return "/" + baseSymbol;
  }
  getTimescaleMarks(symbolInfo, from, to, onDataCallback, resolution) {
    return __async(this, null, function* () {
      const tvSymbol = (symbolInfo == null ? void 0 : symbolInfo.ticker) || (symbolInfo == null ? void 0 : symbolInfo.name);
      const topStepXSymbol = this._convertToTopStepXSymbol(tvSymbol);
      console.info(logPrefix, "getTimescaleMarks", { tvSymbol, topStepXSymbol, from, to, resolution });
      const token = localStorage.getItem("topstepx_token");
      if (!token) {
        console.debug(logPrefix, "getTimescaleMarks: No TopStepX token, skipping");
        onDataCallback([]);
        return;
      }
      if (!topStepXSymbol) {
        console.debug(logPrefix, "getTimescaleMarks: Invalid symbol");
        onDataCallback([]);
        return;
      }
      const cacheKey = `${topStepXSymbol}_${resolution}_${from}_${to}`;
      const cached = this._timescaleMarksCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this._timescaleMarksCacheTTL) {
        console.debug(logPrefix, "getTimescaleMarks: Cache hit");
        onDataCallback(cached.marks);
        return;
      }
      try {
        const marks = yield this._request("/api/topstepx-chart/timescale_marks", {
          symbol: topStepXSymbol,
          from,
          to,
          resolution
        }, {
          timeout: TIMEOUTS.timescaleMarks,
          retry: false,
          dedupe: false,
          method: "GET",
          fetchOptions: {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        });
        if (!Array.isArray(marks)) {
          console.warn(logPrefix, "getTimescaleMarks: Invalid response format");
          onDataCallback([]);
          return;
        }
        const formattedMarks = marks.map((mark) => ({
          id: mark.id,
          time: mark.time,
          color: mark.color || "#b5b5b5",
          label: mark.label || "",
          tooltip: Array.isArray(mark.tooltip) ? mark.tooltip : [],
          imageUrl: mark.imageUrl,
          showLabelWhenImageLoaded: mark.showLabelWhenImageLoaded || false
        }));
        this._timescaleMarksCache.set(cacheKey, {
          marks: formattedMarks,
          timestamp: Date.now()
        });
        if (this._timescaleMarksCache.size > 50) {
          const oldestKey = this._timescaleMarksCache.keys().next().value;
          this._timescaleMarksCache.delete(oldestKey);
        }
        console.info(logPrefix, `getTimescaleMarks: Returned ${formattedMarks.length} marks`);
        onDataCallback(formattedMarks);
      } catch (error) {
        if ((error == null ? void 0 : error.status) === 401 || (error == null ? void 0 : error.status) === 403) {
          console.warn(logPrefix, "getTimescaleMarks: Token expired or invalid");
          onDataCallback([]);
          return;
        }
        console.error(logPrefix, "getTimescaleMarks failed:", error);
        onDataCallback([]);
      }
    });
  }
  getBars(symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) {
    return __async(this, null, function* () {
      const { from, to, firstDataRequest } = periodParams;
      console.info(logPrefix, "getBars", {
        symbol: (symbolInfo == null ? void 0 : symbolInfo.ticker) || (symbolInfo == null ? void 0 : symbolInfo.name),
        resolution,
        from,
        to,
        firstDataRequest,
        session: symbolInfo == null ? void 0 : symbolInfo.subsession_id
      });
      try {
        const symbolName = (symbolInfo == null ? void 0 : symbolInfo.ticker) || (symbolInfo == null ? void 0 : symbolInfo.name);
        if (symbolName === OFFLINE_PLACEHOLDER_SYMBOL) {
          onHistoryCallback([], { noData: true });
          return;
        }
        const params = {
          symbol: symbolInfo.ticker || symbolInfo.name,
          resolution,
          from,
          to
        };
        if (symbolInfo.subsession_id) {
          params.session = symbolInfo.subsession_id;
        }
        const data = yield this._request("/api/datafeed/history", params, {
          timeout: TIMEOUTS.getBars,
          retry: true,
          dedupe: true
        });
        if (data.s === "no_data") {
          console.warn(logPrefix, "getBars no data");
          onHistoryCallback([], { noData: true, nextTime: data.nextTime });
          return;
        }
        if (data.s !== "ok" || !Array.isArray(data.t)) {
          throw new Error("Invalid history response");
        }
        const bars = data.t.map((time, index) => {
          var _a, _b, _c, _d, _e;
          return {
            time: safeNumber(time) * 1e3,
            open: safeNumber((_a = data.o) == null ? void 0 : _a[index]),
            high: safeNumber((_b = data.h) == null ? void 0 : _b[index]),
            low: safeNumber((_c = data.l) == null ? void 0 : _c[index]),
            close: safeNumber((_d = data.c) == null ? void 0 : _d[index]),
            volume: safeNumber((_e = data.v) == null ? void 0 : _e[index])
          };
        });
        console.info(logPrefix, `getBars returned ${bars.length} bars`);
        if (bars.length) {
          const lastBar = bars[bars.length - 1];
          this._setLastBarCache(this._getCacheKey(symbolInfo, resolution), __spreadValues({}, lastBar));
        }
        onHistoryCallback(bars, { noData: bars.length === 0 });
      } catch (error) {
        console.error(logPrefix, "getBars failed:", error);
        if (typeof onErrorCallback === "function") {
          onErrorCallback(error);
        }
      }
    });
  }
  getQuotes(symbols, onDataCallback, onErrorCallback) {
    return __async(this, null, function* () {
      const normalizedSymbols = normalizeQuoteList(symbols);
      console.debug(logPrefix, "getQuotes", normalizedSymbols);
      if (!normalizedSymbols.length) {
        onDataCallback([]);
        return;
      }
      const body = {
        symbols: buildQuoteRequestPayload(symbols)
      };
      try {
        const payload = yield this._request("/api/datafeed/quotes", {}, {
          timeout: TIMEOUTS.quotes,
          retry: true,
          dedupe: false,
          method: "POST",
          fetchOptions: {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        });
        const quotes = Array.isArray(payload) ? payload : [];
        onDataCallback(quotes);
      } catch (error) {
        console.error(logPrefix, "getQuotes failed", (error == null ? void 0 : error.message) || error);
        if (typeof onErrorCallback === "function") {
          onErrorCallback(error);
        }
      }
    });
  }
  subscribeBars(symbolInfo, resolution, onRealtimeCallback, subscriberUID, onResetCacheNeededCallback) {
    this._realtime.subscribeBars(
      symbolInfo,
      resolution,
      onRealtimeCallback,
      subscriberUID,
      onResetCacheNeededCallback
    );
  }
  unsubscribeBars(subscriberUID) {
    this._realtime.unsubscribeBars(subscriberUID);
  }
  subscribeQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID) {
    this._realtime.subscribeQuotes(symbols, fastSymbols, onRealtimeCallback, listenerGUID);
  }
  unsubscribeQuotes(listenerGUID) {
    this._realtime.unsubscribeQuotes(listenerGUID);
  }
  _getCacheKey(symbolInfo, resolution) {
    return this._realtime.getCacheKey(symbolInfo, resolution);
  }
  _setLastBarCache(key, bar) {
    this._realtime.setLastBarCache(key, bar);
  }
  destroy() {
    var _a;
    console.info(logPrefix, "Destroying datafeed instance");
    this._realtime.destroy();
    this._http.clear();
    (_a = this._timescaleMarksCache) == null ? void 0 : _a.clear();
    this.configuration = null;
    this._configPromise = null;
    this._resolveErrorListeners.clear();
    this._pendingSymbolForResolve = null;
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("online", this._onlineListener);
      window.removeEventListener("offline", this._offlineListener);
    }
    console.info(logPrefix, "Datafeed instance destroyed");
  }
};
var tradingview_datafeed_default = TradingViewDatafeed;

// src/datafeed/index.js
var index_default = tradingview_datafeed_default;
export {
  index_default as default
};
//# sourceMappingURL=datafeed.js.map
