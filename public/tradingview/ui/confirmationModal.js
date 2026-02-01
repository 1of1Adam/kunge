/**
 * Confirmation Modal - 显示识别到的股票代码供用户选择确认
 *
 * @module ui/confirmationModal
 */

/**
 * 显示确认弹窗
 *
 * @param {Array<{code: string, exchange: string, symbol: string, name?: string, isDuplicate?: boolean}>} stocks
 *   来自 extractStockCodes() 的股票数组，可附带 name 和 isDuplicate 字段
 * @param {Object} [options]
 * @param {Function} [options.onRetry] - 空状态下"重新上传"按钮的回调
 * @returns {Promise<string[]|null>}
 *   确认时返回选中的 symbol 数组，取消/Escape 返回 null
 */
export function showConfirmationModal(stocks, { onRetry } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ocr-modal';

    // ---------- 空状态 ----------
    if (!stocks || stocks.length === 0) {
      const hasRetry = typeof onRetry === 'function';
      dialog.innerHTML = `
        <div class="ocr-modal-empty">
          <h3>未识别到股票代码</h3>
          <p class="ocr-modal-subtitle">请确保截图中包含清晰的股票代码</p>
          <div class="ocr-modal-actions">
            <button class="ocr-btn-cancel">关闭</button>
            ${hasRetry ? '<button class="ocr-btn-confirm ocr-btn-retry">重新上传</button>' : ''}
          </div>
        </div>
      `;

      const closeBtn = dialog.querySelector('.ocr-btn-cancel');
      closeBtn.addEventListener('click', () => {
        dialog.close();
        dialog.remove();
        resolve(null);
      });

      if (hasRetry) {
        const retryBtn = dialog.querySelector('.ocr-btn-retry');
        retryBtn.addEventListener('click', () => {
          dialog.close();
          dialog.remove();
          onRetry();
          resolve(null);
        });
      }

      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        dialog.close();
        dialog.remove();
        resolve(null);
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      return;
    }

    // ---------- 正常状态 ----------
    const newCount = stocks.filter((s) => !s.isDuplicate).length;
    const dupCount = stocks.length - newCount;

    // 副标题
    const subtitle =
      dupCount > 0
        ? `${newCount} 只新股票，${dupCount} 只已在自选中`
        : '取消勾选不需要导入的项目';

    // Select-all checkbox HTML
    const selectAllHTML =
      newCount > 0
        ? `<label class="ocr-modal-select-all"><input type="checkbox" id="ocr-select-all" checked /><span>全选新股票 (${newCount})</span></label>`
        : '';

    // 构建清单列表
    const itemsHTML = stocks
      .map((stock, i) => {
        const displayName = stock.name || stock.symbol;
        const isDup = !!stock.isDuplicate;
        return `
        <label class="ocr-modal-item${isDup ? ' ocr-modal-item--duplicate' : ''}">
          <input type="checkbox" ${isDup ? '' : 'checked'} data-index="${i}" data-duplicate="${isDup}" />
          <div class="ocr-modal-stock-info">
            <span class="ocr-modal-stock-name">${displayName}${isDup ? '<span class="ocr-modal-badge">已添加</span>' : ''}</span>
            <span class="ocr-modal-stock-code">${stock.code}</span>
          </div>
        </label>`;
      })
      .join('');

    // 初始选中的非重复项数量
    const initialCheckedNew = newCount;

    dialog.innerHTML = `
      <h3>识别到 ${stocks.length} 只股票</h3>
      <p class="ocr-modal-subtitle">${subtitle}</p>
      ${selectAllHTML}
      <div class="ocr-modal-list">
        ${itemsHTML}
      </div>
      <div class="ocr-modal-actions">
        <button class="ocr-btn-cancel">取消</button>
        <button class="ocr-btn-confirm">导入自选 (${initialCheckedNew})</button>
      </div>
    `;

    const confirmBtn = dialog.querySelector('.ocr-btn-confirm');
    const cancelBtn = dialog.querySelector('.ocr-btn-cancel');
    const allCheckboxes = dialog.querySelectorAll('input[type="checkbox"][data-index]');
    const selectAllCb = dialog.querySelector('#ocr-select-all');

    /**
     * 更新确认按钮文字和禁用状态（仅计算非重复项）
     */
    function updateConfirmText() {
      const checkedNew = dialog.querySelectorAll(
        'input[data-duplicate="false"]:checked'
      ).length;
      confirmBtn.textContent = `导入自选 (${checkedNew})`;
      confirmBtn.disabled = checkedNew === 0;
    }

    /**
     * 更新全选复选框状态
     */
    function updateSelectAll() {
      if (!selectAllCb) return;
      const newCbs = dialog.querySelectorAll('input[data-duplicate="false"]');
      const checkedNew = dialog.querySelectorAll(
        'input[data-duplicate="false"]:checked'
      ).length;
      if (checkedNew === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checkedNew === newCbs.length) {
        selectAllCb.checked = true;
        selectAllCb.indeterminate = false;
      } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = true;
      }
    }

    // 监听每个复选框变化
    allCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        updateConfirmText();
        if (cb.dataset.duplicate === 'false') {
          updateSelectAll();
        }
      });
    });

    // 全选复选框变化
    if (selectAllCb) {
      selectAllCb.addEventListener('change', () => {
        const checked = selectAllCb.checked;
        dialog.querySelectorAll('input[data-duplicate="false"]').forEach((cb) => {
          cb.checked = checked;
        });
        updateConfirmText();
      });
    }

    // 确认按钮
    confirmBtn.addEventListener('click', () => {
      const selected = [];
      allCheckboxes.forEach((cb) => {
        if (cb.checked) {
          const idx = parseInt(cb.dataset.index, 10);
          selected.push(stocks[idx].symbol);
        }
      });
      dialog.close();
      dialog.remove();
      resolve(selected.length > 0 ? selected : null);
    });

    // 取消按钮
    cancelBtn.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    // Escape 键
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      dialog.close();
      dialog.remove();
      resolve(null);
    });

    // 初始状态
    updateConfirmText();

    document.body.appendChild(dialog);
    dialog.showModal();
  });
}
