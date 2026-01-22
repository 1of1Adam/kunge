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

// src/saveload/save-load-adapter.js
var SAVE_DEBOUNCE_MS = 1e3;
var STORAGE_KEY = "SaveLoadAdapter_drawingSymbolMap";
var SaveLoadAdapter = class {
  /**
   * @param {string} baseUrl - 后端服务地址
   * @param {Object} options - 配置选项
   * @param {number} options.timeout - 请求超时时间（毫秒），默认 10000
   * @param {number} options.maxRetries - 最大重试次数，默认 3
   * @param {boolean} options.debug - 是否启用调试日志，默认 false
   */
  constructor(baseUrl = `http://${window.location.hostname}:3001`, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout || 1e4;
    this.maxRetries = options.maxRetries || 3;
    this.debug = options.debug || false;
    this._saveDebounceTimer = null;
    this._pendingSave = false;
    this._loadDrawingSymbolMap();
    this._cleanupOldMappings();
    this._setupStorageListener();
    this._log("\u521D\u59CB\u5316\u5B8C\u6210\uFF0C\u540E\u7AEF\u5730\u5740:", this.baseUrl);
  }
  /**
   * 条件日志输出
   */
  _log(...args) {
    if (this.debug) {
      console.log("[SaveLoadAdapter]", ...args);
    }
  }
  /**
   * 发送 HTTP 请求的通用方法（支持超时和重试）
   * @param {string} endpoint - API 端点
   * @param {Object} options - fetch 选项
   * @param {number} retries - 剩余重试次数
   */
  _fetch(_0) {
    return __async(this, arguments, function* (endpoint, options = {}, retries = this.maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      try {
        const response = yield fetch(`${this.baseUrl}/api/storage${endpoint}`, __spreadProps(__spreadValues({
          headers: { "Content-Type": "application/json" }
        }, options), {
          signal: controller.signal
        }));
        clearTimeout(timeoutId);
        if (!response.ok) {
          const error = yield response.json().catch(() => ({ message: response.statusText }));
          throw new Error(error.message || `HTTP ${response.status}`);
        }
        return response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (retries > 0 && error.name !== "AbortError") {
          this._log(`\u8BF7\u6C42\u5931\u8D25\uFF0C\u91CD\u8BD5\u4E2D... (${retries} \u6B21\u5269\u4F59)`);
          yield new Promise((r) => setTimeout(r, 1e3));
          return this._fetch(endpoint, options, retries - 1);
        }
        console.error(`[SaveLoadAdapter] \u8BF7\u6C42\u5931\u8D25 ${endpoint}:`, error.message);
        throw error;
      }
    });
  }
  // ==================== 图表布局 (Charts) ====================
  /**
   * 获取所有图表列表
   * @returns {Promise<ChartMetaInfo[]>}
   */
  getAllCharts() {
    return __async(this, null, function* () {
      this._log("getAllCharts");
      return this._fetch("/charts");
    });
  }
  /**
   * 保存图表
   * @param {ChartData} chartData
   * @returns {Promise<string|number>} 返回图表 ID
   */
  saveChart(chartData) {
    return __async(this, null, function* () {
      this._log("saveChart:", chartData.name);
      const result = yield this._fetch("/charts", {
        method: "POST",
        body: JSON.stringify(chartData)
      });
      return result.id;
    });
  }
  /**
   * 获取图表内容
   * @param {string|number} chartId
   * @returns {Promise<string>}
   */
  getChartContent(chartId) {
    return __async(this, null, function* () {
      this._log("getChartContent:", chartId);
      const result = yield this._fetch(`/charts/${chartId}/content`);
      return result.content;
    });
  }
  /**
   * 删除图表
   * @param {string|number} chartId
   * @returns {Promise<void>}
   */
  removeChart(chartId) {
    return __async(this, null, function* () {
      this._log("removeChart:", chartId);
      yield this._fetch(`/charts/${chartId}`, { method: "DELETE" });
    });
  }
  // ==================== 指标模板 (Study Templates) ====================
  /**
   * 获取所有指标模板
   * @returns {Promise<StudyTemplateMetaInfo[]>}
   */
  getAllStudyTemplates() {
    return __async(this, null, function* () {
      this._log("getAllStudyTemplates");
      return this._fetch("/study-templates");
    });
  }
  /**
   * 保存指标模板
   * @param {StudyTemplateData} studyTemplateData
   * @returns {Promise<void>}
   */
  saveStudyTemplate(studyTemplateData) {
    return __async(this, null, function* () {
      this._log("saveStudyTemplate:", studyTemplateData.name);
      yield this._fetch("/study-templates", {
        method: "POST",
        body: JSON.stringify(studyTemplateData)
      });
    });
  }
  /**
   * 获取指标模板内容
   * @param {StudyTemplateMetaInfo} studyTemplateInfo
   * @returns {Promise<string>}
   */
  getStudyTemplateContent(studyTemplateInfo) {
    return __async(this, null, function* () {
      this._log("getStudyTemplateContent:", studyTemplateInfo.name);
      const result = yield this._fetch(`/study-templates/${encodeURIComponent(studyTemplateInfo.name)}`);
      return result.content;
    });
  }
  /**
   * 删除指标模板
   * @param {StudyTemplateMetaInfo} studyTemplateInfo
   * @returns {Promise<void>}
   */
  removeStudyTemplate(studyTemplateInfo) {
    return __async(this, null, function* () {
      this._log("removeStudyTemplate:", studyTemplateInfo.name);
      yield this._fetch(`/study-templates/${encodeURIComponent(studyTemplateInfo.name)}`, {
        method: "DELETE"
      });
    });
  }
  // ==================== 绘图模板 (Drawing Templates) ====================
  /**
   * 获取某个工具的所有模板名称
   * @param {string} toolName
   * @returns {Promise<string[]>}
   */
  getDrawingTemplates(toolName) {
    return __async(this, null, function* () {
      this._log("getDrawingTemplates:", toolName);
      const result = yield this._fetch(`/drawing-templates/${encodeURIComponent(toolName)}`);
      return result.templates || [];
    });
  }
  /**
   * 保存绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @param {string} content
   * @returns {Promise<void>}
   */
  saveDrawingTemplate(toolName, templateName, content) {
    return __async(this, null, function* () {
      this._log("saveDrawingTemplate:", toolName, templateName);
      yield this._fetch(
        `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`,
        {
          method: "POST",
          body: JSON.stringify({ content })
        }
      );
    });
  }
  /**
   * 加载绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @returns {Promise<string>}
   */
  loadDrawingTemplate(toolName, templateName) {
    return __async(this, null, function* () {
      this._log("loadDrawingTemplate:", toolName, templateName);
      const result = yield this._fetch(
        `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`
      );
      return result.content;
    });
  }
  /**
   * 删除绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @returns {Promise<void>}
   */
  removeDrawingTemplate(toolName, templateName) {
    return __async(this, null, function* () {
      this._log("removeDrawingTemplate:", toolName, templateName);
      yield this._fetch(
        `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`,
        { method: "DELETE" }
      );
    });
  }
  // ==================== 图表模板 (Chart Templates) ====================
  /**
   * 获取所有图表模板名称
   * @returns {Promise<string[]>}
   */
  getAllChartTemplates() {
    return __async(this, null, function* () {
      this._log("getAllChartTemplates");
      const result = yield this._fetch("/chart-templates");
      return result.templates || [];
    });
  }
  /**
   * 保存图表模板
   * @param {string} templateName
   * @param {ChartTemplateContent} theme
   * @returns {Promise<void>}
   */
  saveChartTemplate(templateName, theme) {
    return __async(this, null, function* () {
      this._log("saveChartTemplate:", templateName);
      yield this._fetch("/chart-templates", {
        method: "POST",
        body: JSON.stringify({ name: templateName, content: theme })
      });
    });
  }
  /**
   * 获取图表模板内容
   * @param {string} templateName
   * @returns {Promise<ChartTemplate>}
   */
  getChartTemplateContent(templateName) {
    return __async(this, null, function* () {
      this._log("getChartTemplateContent:", templateName);
      const result = yield this._fetch(`/chart-templates/${encodeURIComponent(templateName)}`);
      return { content: result.content };
    });
  }
  /**
   * 删除图表模板
   * @param {string} templateName
   * @returns {Promise<void>}
   */
  removeChartTemplate(templateName) {
    return __async(this, null, function* () {
      this._log("removeChartTemplate:", templateName);
      yield this._fetch(`/chart-templates/${encodeURIComponent(templateName)}`, {
        method: "DELETE"
      });
    });
  }
  // ==================== 按符号保存绘图 (Symbol Drawings) ====================
  // 实现 TradingView saveload_separate_drawings_storage 功能
  // 官方文档: https://www.tradingview.com/charting-library-docs/latest/saving_loading/saving_drawings_separately/
  /**
   * 保存绘图状态到后端（按符号分组）
   * 当用户添加、修改或删除图表上的绘图时，TradingView 会调用此方法
   *
   * @param {string} layoutId - 图表布局 ID
   * @param {string|number} chartId - 图表 ID
   * @param {LineToolsAndGroupsState} state - 绘图状态对象
   *   - state.sources: Map<string, LineToolState | null> - 绘图 key -> 状态的映射，null 表示删除
   *   - state.groups: Map<string, string[] | null> - 分组 key -> 绘图 key 数组的映射
   * @returns {Promise<void>}
   */
  saveLineToolsAndGroups(layoutId, chartId, state) {
    return __async(this, null, function* () {
      this._log("saveLineToolsAndGroups:", { layoutId, chartId });
      const sources = state.sources;
      const groups = state.groups;
      const symbolDrawingsMap = /* @__PURE__ */ new Map();
      const symbolGroupsMap = /* @__PURE__ */ new Map();
      if (sources && sources.size > 0) {
        for (const [key, drawingState] of sources) {
          const symbol = drawingState == null ? void 0 : drawingState.symbol;
          if (!symbol && drawingState !== null) {
            this._log(`\u8DF3\u8FC7\u65E0\u7B26\u53F7\u7684\u7ED8\u56FE: ${key}`);
            continue;
          }
          const targetSymbol = symbol || this._getDrawingSymbol(layoutId, chartId, key);
          if (!targetSymbol) continue;
          if (!symbolDrawingsMap.has(targetSymbol)) {
            symbolDrawingsMap.set(targetSymbol, []);
          }
          symbolDrawingsMap.get(targetSymbol).push({ key, state: drawingState });
          if (drawingState !== null) {
            this._setDrawingSymbol(layoutId, chartId, key, symbol);
          } else {
            this._removeDrawingSymbol(layoutId, chartId, key);
          }
        }
      }
      if (groups && groups.size > 0) {
        for (const [groupKey, drawingKeys] of groups) {
          let targetSymbol = null;
          if (drawingKeys && drawingKeys.length > 0) {
            targetSymbol = this._getDrawingSymbol(layoutId, chartId, drawingKeys[0]);
          }
          if (!targetSymbol) {
            this._log(`\u8DF3\u8FC7\u65E0\u6CD5\u786E\u5B9A\u7B26\u53F7\u7684\u5206\u7EC4: ${groupKey}`);
            continue;
          }
          if (!symbolGroupsMap.has(targetSymbol)) {
            symbolGroupsMap.set(targetSymbol, []);
          }
          symbolGroupsMap.get(targetSymbol).push({
            key: groupKey,
            drawingKeys
            // null 表示删除
          });
        }
      }
      const promises = [];
      for (const [symbol, drawings] of symbolDrawingsMap) {
        this._log(`\u4FDD\u5B58\u7B26\u53F7 ${symbol} \u7684 ${drawings.length} \u4E2A\u7ED8\u56FE`);
        promises.push(
          this._fetch(`/drawings/${encodeURIComponent(symbol)}/batch`, {
            method: "POST",
            body: JSON.stringify({ drawings })
          }).catch((err) => {
            console.error(`[SaveLoadAdapter] \u4FDD\u5B58\u7B26\u53F7 ${symbol} \u7ED8\u56FE\u5931\u8D25:`, err);
          })
        );
      }
      for (const [symbol, groupsList] of symbolGroupsMap) {
        this._log(`\u4FDD\u5B58\u7B26\u53F7 ${symbol} \u7684 ${groupsList.length} \u4E2A\u5206\u7EC4`);
        promises.push(
          this._fetch(`/drawings/${encodeURIComponent(symbol)}/groups/batch`, {
            method: "POST",
            body: JSON.stringify({ groups: groupsList })
          }).catch((err) => {
            console.error(`[SaveLoadAdapter] \u4FDD\u5B58\u7B26\u53F7 ${symbol} \u5206\u7EC4\u5931\u8D25:`, err);
          })
        );
      }
      yield Promise.all(promises);
    });
  }
  /**
   * 从后端加载绘图状态（按符号）
   * 当用户打开图表或切换符号时，TradingView 会调用此方法
   *
   * @param {string} layoutId - 图表布局 ID
   * @param {string|number} chartId - 图表 ID
   * @param {string} requestType - 请求类型: 'mainSeriesLineTools' | 'lineToolsWithoutSymbol' | 'allLineTools' | 'studyLineTools'
   * @param {LineToolsAndGroupsLoadRequestContext} requestContext - 请求上下文，包含 symbol 等信息
   * @returns {Promise<Partial<LineToolsAndGroupsState> | null>}
   */
  loadLineToolsAndGroups(layoutId, chartId, requestType, requestContext) {
    return __async(this, null, function* () {
      this._log("loadLineToolsAndGroups:", { layoutId, chartId, requestType, requestContext });
      const symbol = requestContext == null ? void 0 : requestContext.symbol;
      if (!symbol) {
        this._log("loadLineToolsAndGroups: \u6CA1\u6709\u6307\u5B9A\u7B26\u53F7\uFF0C\u8FD4\u56DE null");
        return null;
      }
      try {
        const [drawingsResult, groupsResult] = yield Promise.all([
          this._fetch(`/drawings/${encodeURIComponent(symbol)}`).catch((err) => {
            this._log(`\u52A0\u8F7D\u7ED8\u56FE\u5931\u8D25 (${symbol}):`, err.message);
            return { drawings: {} };
          }),
          this._fetch(`/drawings/${encodeURIComponent(symbol)}/groups`).catch((err) => {
            this._log(`\u52A0\u8F7D\u5206\u7EC4\u5931\u8D25 (${symbol}):`, err.message);
            return { groups: {} };
          })
        ]);
        const rawDrawings = drawingsResult && typeof drawingsResult.drawings === "object" && drawingsResult.drawings !== null ? drawingsResult.drawings : {};
        const rawGroups = groupsResult && typeof groupsResult.groups === "object" && groupsResult.groups !== null ? groupsResult.groups : {};
        const sources = /* @__PURE__ */ new Map();
        for (const [key, state] of Object.entries(rawDrawings)) {
          sources.set(key, state);
          this._setDrawingSymbol(layoutId, chartId, key, symbol);
        }
        const groups = /* @__PURE__ */ new Map();
        for (const [key, drawingKeys] of Object.entries(rawGroups)) {
          groups.set(key, drawingKeys);
        }
        this._log(`\u52A0\u8F7D\u4E86\u7B26\u53F7 ${symbol} \u7684 ${sources.size} \u4E2A\u7ED8\u56FE\u548C ${groups.size} \u4E2A\u5206\u7EC4`);
        return {
          sources,
          groups
        };
      } catch (error) {
        console.error(`[SaveLoadAdapter] \u52A0\u8F7D\u7B26\u53F7 ${symbol} \u7ED8\u56FE\u5931\u8D25:`, error);
        return null;
      }
    });
  }
  // ==================== 绘图符号映射辅助方法 ====================
  // 用于追踪每个绘图属于哪个符号（支持删除操作时找到目标符号）
  // 使用 localStorage 持久化，避免页面刷新后丢失
  /**
   * 从 localStorage 加载绘图符号映射
   */
  _loadDrawingSymbolMap() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      this._drawingSymbolMap = saved ? JSON.parse(saved) : {};
      this._log("\u5DF2\u52A0\u8F7D\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04:", Object.keys(this._drawingSymbolMap).length, "\u6761");
    } catch (e) {
      console.warn("[SaveLoadAdapter] \u52A0\u8F7D\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04\u5931\u8D25:", e);
      this._drawingSymbolMap = {};
    }
  }
  /**
   * P0-6 修复: 防抖保存绘图符号映射到 localStorage
   * 批量合并 1 秒内的写入，减少 localStorage 写入频率
   * @param {boolean} immediate - 是否立即保存（用于页面卸载等场景）
   */
  _saveDrawingSymbolMap(immediate = false) {
    this._pendingSave = true;
    if (immediate) {
      if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = null;
      }
      this._doSaveDrawingSymbolMap();
      return;
    }
    if (this._saveDebounceTimer) {
      return;
    }
    this._saveDebounceTimer = setTimeout(() => {
      this._saveDebounceTimer = null;
      this._doSaveDrawingSymbolMap();
    }, SAVE_DEBOUNCE_MS);
  }
  /**
   * P0-6: 实际执行保存操作
   */
  _doSaveDrawingSymbolMap() {
    if (!this._pendingSave) return;
    this._pendingSave = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._drawingSymbolMap));
      this._log("\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04\u5DF2\u4FDD\u5B58");
    } catch (e) {
      console.warn("[SaveLoadAdapter] \u4FDD\u5B58\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04\u5931\u8D25:", e);
    }
  }
  /**
   * P0-6 修复: 设置跨标签页同步监听
   * 当其他标签页修改 localStorage 时，同步更新本地缓存
   */
  _setupStorageListener() {
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      this._log("\u68C0\u6D4B\u5230\u5176\u4ED6\u6807\u7B7E\u9875\u66F4\u65B0\u4E86\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04");
      try {
        if (event.newValue) {
          const newData = JSON.parse(event.newValue);
          const merged = __spreadValues(__spreadValues({}, this._drawingSymbolMap), newData);
          this._drawingSymbolMap = merged;
          this._log("\u5DF2\u5408\u5E76\u8DE8\u6807\u7B7E\u9875\u66F4\u65B0\uFF0C\u5F53\u524D\u6761\u76EE\u6570:", Object.keys(merged).length);
        } else {
          this._log("\u5176\u4ED6\u6807\u7B7E\u9875\u6E05\u7A7A\u4E86\u7ED8\u56FE\u7B26\u53F7\u6620\u5C04\uFF0C\u672C\u5730\u6570\u636E\u4FDD\u6301\u4E0D\u53D8");
        }
      } catch (e) {
        console.warn("[SaveLoadAdapter] \u5904\u7406\u8DE8\u6807\u7B7E\u9875\u66F4\u65B0\u5931\u8D25:", e);
      }
    });
    window.addEventListener("beforeunload", () => {
      if (this._pendingSave) {
        this._saveDrawingSymbolMap(true);
      }
    });
    this._log("\u8DE8\u6807\u7B7E\u9875\u540C\u6B65\u76D1\u542C\u5DF2\u8BBE\u7F6E");
  }
  /**
   * 获取存储 key
   */
  _getDrawingMapKey(layoutId, chartId, drawingKey) {
    return `${layoutId || "default"}/${chartId}/${drawingKey}`;
  }
  /**
   * 记录绘图与符号的映射（自动持久化到 localStorage）
   */
  _setDrawingSymbol(layoutId, chartId, drawingKey, symbol) {
    if (!this._drawingSymbolMap) {
      this._drawingSymbolMap = {};
    }
    this._drawingSymbolMap[this._getDrawingMapKey(layoutId, chartId, drawingKey)] = symbol;
    this._saveDrawingSymbolMap();
  }
  /**
   * 获取绘图对应的符号
   */
  _getDrawingSymbol(layoutId, chartId, drawingKey) {
    if (!this._drawingSymbolMap) return null;
    return this._drawingSymbolMap[this._getDrawingMapKey(layoutId, chartId, drawingKey)];
  }
  /**
   * 移除绘图符号映射（自动持久化到 localStorage）
   */
  _removeDrawingSymbol(layoutId, chartId, drawingKey) {
    if (!this._drawingSymbolMap) return;
    delete this._drawingSymbolMap[this._getDrawingMapKey(layoutId, chartId, drawingKey)];
    this._saveDrawingSymbolMap();
  }
  /**
   * 清理过多的旧映射数据，防止 localStorage 无限增长
   * 当映射条目超过 MAX_ENTRIES 时，删除最早的一半
   */
  _cleanupOldMappings() {
    const MAX_ENTRIES = 1e3;
    if (!this._drawingSymbolMap) return;
    const keys = Object.keys(this._drawingSymbolMap);
    if (keys.length <= MAX_ENTRIES) return;
    const toRemoveCount = Math.floor(keys.length / 2);
    const toRemove = keys.slice(0, toRemoveCount);
    toRemove.forEach((key) => delete this._drawingSymbolMap[key]);
    this._saveDrawingSymbolMap();
    this._log(`\u6E05\u7406\u4E86 ${toRemoveCount} \u4E2A\u65E7\u7684\u7ED8\u56FE\u6620\u5C04\uFF0C\u5F53\u524D\u5269\u4F59 ${keys.length - toRemoveCount} \u6761`);
  }
};
var save_load_adapter_default = SaveLoadAdapter;

// src/saveload/index.js
var index_default = save_load_adapter_default;
export {
  index_default as default
};
//# sourceMappingURL=saveLoadAdapter.js.map
