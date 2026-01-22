/**
 * TradingView SaveLoadAdapter
 * 实现 IExternalSaveLoadAdapter 接口，连接后端存储服务
 */

// P0-6: localStorage 同步配置
const SAVE_DEBOUNCE_MS = 1000; // 防抖延迟 1 秒
const STORAGE_KEY = 'SaveLoadAdapter_drawingSymbolMap';

class SaveLoadAdapter {
  /**
   * @param {string} baseUrl - 后端服务地址
   * @param {Object} options - 配置选项
   * @param {number} options.timeout - 请求超时时间（毫秒），默认 10000
   * @param {number} options.maxRetries - 最大重试次数，默认 3
   * @param {boolean} options.debug - 是否启用调试日志，默认 false
   */
  constructor(baseUrl = `http://${window.location.hostname}:3001`, options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options.timeout || 10000;
    this.maxRetries = options.maxRetries || 3;
    this.debug = options.debug || false;

    // P0-6 修复: 防抖保存定时器
    this._saveDebounceTimer = null;
    this._pendingSave = false;

    // 从 localStorage 恢复绘图符号映射（解决刷新后丢失问题）
    this._loadDrawingSymbolMap();

    // 清理过多的旧映射数据，防止 localStorage 无限增长
    this._cleanupOldMappings();

    // P0-6 修复: 监听 storage 事件处理跨标签页更新
    this._setupStorageListener();

    this._log('初始化完成，后端地址:', this.baseUrl);
  }

  /**
   * 条件日志输出
   */
  _log(...args) {
    if (this.debug) {
      console.log('[SaveLoadAdapter]', ...args);
    }
  }

  /**
   * 发送 HTTP 请求的通用方法（支持超时和重试）
   * @param {string} endpoint - API 端点
   * @param {Object} options - fetch 选项
   * @param {number} retries - 剩余重试次数
   */
  async _fetch(endpoint, options = {}, retries = this.maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/storage${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      // 网络错误时重试（超时异常不重试）
      if (retries > 0 && error.name !== 'AbortError') {
        this._log(`请求失败，重试中... (${retries} 次剩余)`);
        await new Promise(r => setTimeout(r, 1000));
        return this._fetch(endpoint, options, retries - 1);
      }

      console.error(`[SaveLoadAdapter] 请求失败 ${endpoint}:`, error.message);
      throw error;
    }
  }

  // ==================== 图表布局 (Charts) ====================

  /**
   * 获取所有图表列表
   * @returns {Promise<ChartMetaInfo[]>}
   */
  async getAllCharts() {
    this._log('getAllCharts');
    return this._fetch('/charts');
  }

  /**
   * 保存图表
   * @param {ChartData} chartData
   * @returns {Promise<string|number>} 返回图表 ID
   */
  async saveChart(chartData) {
    this._log('saveChart:', chartData.name);
    const result = await this._fetch('/charts', {
      method: 'POST',
      body: JSON.stringify(chartData),
    });
    return result.id;
  }

  /**
   * 获取图表内容
   * @param {string|number} chartId
   * @returns {Promise<string>}
   */
  async getChartContent(chartId) {
    this._log('getChartContent:', chartId);
    const result = await this._fetch(`/charts/${chartId}/content`);
    return result.content;
  }

  /**
   * 删除图表
   * @param {string|number} chartId
   * @returns {Promise<void>}
   */
  async removeChart(chartId) {
    this._log('removeChart:', chartId);
    await this._fetch(`/charts/${chartId}`, { method: 'DELETE' });
  }

  // ==================== 指标模板 (Study Templates) ====================

  /**
   * 获取所有指标模板
   * @returns {Promise<StudyTemplateMetaInfo[]>}
   */
  async getAllStudyTemplates() {
    this._log('getAllStudyTemplates');
    return this._fetch('/study-templates');
  }

  /**
   * 保存指标模板
   * @param {StudyTemplateData} studyTemplateData
   * @returns {Promise<void>}
   */
  async saveStudyTemplate(studyTemplateData) {
    this._log('saveStudyTemplate:', studyTemplateData.name);
    await this._fetch('/study-templates', {
      method: 'POST',
      body: JSON.stringify(studyTemplateData),
    });
  }

  /**
   * 获取指标模板内容
   * @param {StudyTemplateMetaInfo} studyTemplateInfo
   * @returns {Promise<string>}
   */
  async getStudyTemplateContent(studyTemplateInfo) {
    this._log('getStudyTemplateContent:', studyTemplateInfo.name);
    const result = await this._fetch(`/study-templates/${encodeURIComponent(studyTemplateInfo.name)}`);
    return result.content;
  }

  /**
   * 删除指标模板
   * @param {StudyTemplateMetaInfo} studyTemplateInfo
   * @returns {Promise<void>}
   */
  async removeStudyTemplate(studyTemplateInfo) {
    this._log('removeStudyTemplate:', studyTemplateInfo.name);
    await this._fetch(`/study-templates/${encodeURIComponent(studyTemplateInfo.name)}`, {
      method: 'DELETE',
    });
  }

  // ==================== 绘图模板 (Drawing Templates) ====================

  /**
   * 获取某个工具的所有模板名称
   * @param {string} toolName
   * @returns {Promise<string[]>}
   */
  async getDrawingTemplates(toolName) {
    this._log('getDrawingTemplates:', toolName);
    const result = await this._fetch(`/drawing-templates/${encodeURIComponent(toolName)}`);
    return result.templates || [];
  }

  /**
   * 保存绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @param {string} content
   * @returns {Promise<void>}
   */
  async saveDrawingTemplate(toolName, templateName, content) {
    this._log('saveDrawingTemplate:', toolName, templateName);
    await this._fetch(
      `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`,
      {
        method: 'POST',
        body: JSON.stringify({ content }),
      }
    );
  }

  /**
   * 加载绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @returns {Promise<string>}
   */
  async loadDrawingTemplate(toolName, templateName) {
    this._log('loadDrawingTemplate:', toolName, templateName);
    const result = await this._fetch(
      `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`
    );
    return result.content;
  }

  /**
   * 删除绘图模板
   * @param {string} toolName
   * @param {string} templateName
   * @returns {Promise<void>}
   */
  async removeDrawingTemplate(toolName, templateName) {
    this._log('removeDrawingTemplate:', toolName, templateName);
    await this._fetch(
      `/drawing-templates/${encodeURIComponent(toolName)}/${encodeURIComponent(templateName)}`,
      { method: 'DELETE' }
    );
  }

  // ==================== 图表模板 (Chart Templates) ====================

  /**
   * 获取所有图表模板名称
   * @returns {Promise<string[]>}
   */
  async getAllChartTemplates() {
    this._log('getAllChartTemplates');
    const result = await this._fetch('/chart-templates');
    return result.templates || [];
  }

  /**
   * 保存图表模板
   * @param {string} templateName
   * @param {ChartTemplateContent} theme
   * @returns {Promise<void>}
   */
  async saveChartTemplate(templateName, theme) {
    this._log('saveChartTemplate:', templateName);
    await this._fetch('/chart-templates', {
      method: 'POST',
      body: JSON.stringify({ name: templateName, content: theme }),
    });
  }

  /**
   * 获取图表模板内容
   * @param {string} templateName
   * @returns {Promise<ChartTemplate>}
   */
  async getChartTemplateContent(templateName) {
    this._log('getChartTemplateContent:', templateName);
    const result = await this._fetch(`/chart-templates/${encodeURIComponent(templateName)}`);
    return { content: result.content };
  }

  /**
   * 删除图表模板
   * @param {string} templateName
   * @returns {Promise<void>}
   */
  async removeChartTemplate(templateName) {
    this._log('removeChartTemplate:', templateName);
    await this._fetch(`/chart-templates/${encodeURIComponent(templateName)}`, {
      method: 'DELETE',
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
  async saveLineToolsAndGroups(layoutId, chartId, state) {
    this._log('saveLineToolsAndGroups:', { layoutId, chartId });

    const sources = state.sources;
    const groups = state.groups;

    // 按符号分组处理绘图
    const symbolDrawingsMap = new Map(); // symbol -> [{ key, state }]
    const symbolGroupsMap = new Map();   // symbol -> [{ key, drawingKeys }]

    // 处理绘图 sources
    if (sources && sources.size > 0) {
      for (const [key, drawingState] of sources) {
        const symbol = drawingState?.symbol;

        if (!symbol && drawingState !== null) {
          this._log(`跳过无符号的绘图: ${key}`);
          continue;
        }

        // 使用上一次记录的符号（用于删除操作）
        const targetSymbol = symbol || this._getDrawingSymbol(layoutId, chartId, key);
        if (!targetSymbol) continue;

        if (!symbolDrawingsMap.has(targetSymbol)) {
          symbolDrawingsMap.set(targetSymbol, []);
        }

        symbolDrawingsMap.get(targetSymbol).push({ key, state: drawingState });

        // 记录绘图与符号的映射关系
        if (drawingState !== null) {
          this._setDrawingSymbol(layoutId, chartId, key, symbol);
        } else {
          this._removeDrawingSymbol(layoutId, chartId, key);
        }
      }
    }

    // 处理分组 groups
    if (groups && groups.size > 0) {
      for (const [groupKey, drawingKeys] of groups) {
        // 从分组中的第一个绘图获取符号
        let targetSymbol = null;
        if (drawingKeys && drawingKeys.length > 0) {
          targetSymbol = this._getDrawingSymbol(layoutId, chartId, drawingKeys[0]);
        }

        if (!targetSymbol) {
          this._log(`跳过无法确定符号的分组: ${groupKey}`);
          continue;
        }

        if (!symbolGroupsMap.has(targetSymbol)) {
          symbolGroupsMap.set(targetSymbol, []);
        }

        symbolGroupsMap.get(targetSymbol).push({
          key: groupKey,
          drawingKeys: drawingKeys, // null 表示删除
        });
      }
    }

    // 批量保存绘图和分组
    const promises = [];

    // 保存绘图
    for (const [symbol, drawings] of symbolDrawingsMap) {
      this._log(`保存符号 ${symbol} 的 ${drawings.length} 个绘图`);
      promises.push(
        this._fetch(`/drawings/${encodeURIComponent(symbol)}/batch`, {
          method: 'POST',
          body: JSON.stringify({ drawings }),
        }).catch(err => {
          console.error(`[SaveLoadAdapter] 保存符号 ${symbol} 绘图失败:`, err);
        })
      );
    }

    // 保存分组
    for (const [symbol, groupsList] of symbolGroupsMap) {
      this._log(`保存符号 ${symbol} 的 ${groupsList.length} 个分组`);
      promises.push(
        this._fetch(`/drawings/${encodeURIComponent(symbol)}/groups/batch`, {
          method: 'POST',
          body: JSON.stringify({ groups: groupsList }),
        }).catch(err => {
          console.error(`[SaveLoadAdapter] 保存符号 ${symbol} 分组失败:`, err);
        })
      );
    }

    await Promise.all(promises);
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
  async loadLineToolsAndGroups(layoutId, chartId, requestType, requestContext) {
    this._log('loadLineToolsAndGroups:', { layoutId, chartId, requestType, requestContext });

    // 从请求上下文中获取符号
    const symbol = requestContext?.symbol;
    if (!symbol) {
      this._log('loadLineToolsAndGroups: 没有指定符号，返回 null');
      return null;
    }

    try {
      // 并行加载绘图和分组
      const [drawingsResult, groupsResult] = await Promise.all([
        this._fetch(`/drawings/${encodeURIComponent(symbol)}`).catch(err => {
          this._log(`加载绘图失败 (${symbol}):`, err.message);
          return { drawings: {} };
        }),
        this._fetch(`/drawings/${encodeURIComponent(symbol)}/groups`).catch(err => {
          this._log(`加载分组失败 (${symbol}):`, err.message);
          return { groups: {} };
        }),
      ]);

      // 增强的类型安全检查
      const rawDrawings = (drawingsResult && typeof drawingsResult.drawings === 'object' && drawingsResult.drawings !== null)
        ? drawingsResult.drawings
        : {};
      const rawGroups = (groupsResult && typeof groupsResult.groups === 'object' && groupsResult.groups !== null)
        ? groupsResult.groups
        : {};

      // 构建 Map 格式的 sources
      const sources = new Map();
      for (const [key, state] of Object.entries(rawDrawings)) {
        sources.set(key, state);
        // 记录映射关系
        this._setDrawingSymbol(layoutId, chartId, key, symbol);
      }

      // 构建 Map 格式的 groups
      const groups = new Map();
      for (const [key, drawingKeys] of Object.entries(rawGroups)) {
        groups.set(key, drawingKeys);
      }

      this._log(`加载了符号 ${symbol} 的 ${sources.size} 个绘图和 ${groups.size} 个分组`);

      return {
        sources,
        groups,
      };
    } catch (error) {
      console.error(`[SaveLoadAdapter] 加载符号 ${symbol} 绘图失败:`, error);
      return null; // 根据官方文档，失败时返回 null
    }
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
      this._log('已加载绘图符号映射:', Object.keys(this._drawingSymbolMap).length, '条');
    } catch (e) {
      console.warn('[SaveLoadAdapter] 加载绘图符号映射失败:', e);
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

    // 如果需要立即保存，取消现有定时器并立即执行
    if (immediate) {
      if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
        this._saveDebounceTimer = null;
      }
      this._doSaveDrawingSymbolMap();
      return;
    }

    // 防抖：如果已有定时器，不重复设置
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
      this._log('绘图符号映射已保存');
    } catch (e) {
      console.warn('[SaveLoadAdapter] 保存绘图符号映射失败:', e);
    }
  }

  /**
   * P0-6 修复: 设置跨标签页同步监听
   * 当其他标签页修改 localStorage 时，同步更新本地缓存
   */
  _setupStorageListener() {
    // storage 事件只在其他标签页修改时触发，不会在当前页面触发
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;

      this._log('检测到其他标签页更新了绘图符号映射');

      try {
        if (event.newValue) {
          const newData = JSON.parse(event.newValue);
          // 合并策略：其他标签页的新数据优先，但保留本地独有的条目
          // 这避免了一个标签页删除另一个标签页正在使用的映射
          const merged = { ...this._drawingSymbolMap, ...newData };
          this._drawingSymbolMap = merged;
          this._log('已合并跨标签页更新，当前条目数:', Object.keys(merged).length);
        } else {
          // 其他标签页清空了数据，这里不做处理，保留本地数据
          this._log('其他标签页清空了绘图符号映射，本地数据保持不变');
        }
      } catch (e) {
        console.warn('[SaveLoadAdapter] 处理跨标签页更新失败:', e);
      }
    });

    // 页面卸载前确保保存所有待保存的数据
    window.addEventListener('beforeunload', () => {
      if (this._pendingSave) {
        this._saveDrawingSymbolMap(true); // 立即保存
      }
    });

    this._log('跨标签页同步监听已设置');
  }

  /**
   * 获取存储 key
   */
  _getDrawingMapKey(layoutId, chartId, drawingKey) {
    return `${layoutId || 'default'}/${chartId}/${drawingKey}`;
  }

  /**
   * 记录绘图与符号的映射（自动持久化到 localStorage）
   */
  _setDrawingSymbol(layoutId, chartId, drawingKey, symbol) {
    if (!this._drawingSymbolMap) {
      this._drawingSymbolMap = {};
    }
    this._drawingSymbolMap[this._getDrawingMapKey(layoutId, chartId, drawingKey)] = symbol;
    this._saveDrawingSymbolMap(); // 持久化到 localStorage
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
    this._saveDrawingSymbolMap(); // 持久化到 localStorage
  }

  /**
   * 清理过多的旧映射数据，防止 localStorage 无限增长
   * 当映射条目超过 MAX_ENTRIES 时，删除最早的一半
   */
  _cleanupOldMappings() {
    const MAX_ENTRIES = 1000; // 最大保留条目数

    if (!this._drawingSymbolMap) return;

    const keys = Object.keys(this._drawingSymbolMap);
    if (keys.length <= MAX_ENTRIES) return;

    // 删除前一半的条目（假设较早添加的在前面）
    const toRemoveCount = Math.floor(keys.length / 2);
    const toRemove = keys.slice(0, toRemoveCount);

    toRemove.forEach(key => delete this._drawingSymbolMap[key]);
    this._saveDrawingSymbolMap();

    this._log(`清理了 ${toRemoveCount} 个旧的绘图映射，当前剩余 ${keys.length - toRemoveCount} 条`);
  }

}

// 导出
export default SaveLoadAdapter;
