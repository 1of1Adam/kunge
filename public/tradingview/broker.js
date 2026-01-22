
export class BrokerAdapter {
  constructor(host) {
    this._host = host;
  }

  async isTradable(symbol) {
    return true;
  }

  connectionStatus() {
    return 1; // Connected
  }

  accountManagerInfo() {
    return {
      accountTitle: 'Trading Account',
      summary: [
        { text: 'Balance', wValue: 10000 },
        { text: 'Equity', wValue: 10000 },
      ],
      orderColumns: [
        { id: 'symbol', label: 'Symbol', dataIndex: 'symbol' },
        { id: 'side', label: 'Side', dataIndex: 'side' },
        { id: 'qty', label: 'Qty', dataIndex: 'qty' },
        { id: 'status', label: 'Status', dataIndex: 'status' },
      ],
      positionColumns: [
         { id: 'symbol', label: 'Symbol', dataIndex: 'symbol' },
         { id: 'side', label: 'Side', dataIndex: 'side' },
         { id: 'qty', label: 'Qty', dataIndex: 'qty' },
         { id: 'avgPrice', label: 'Avg Price', dataIndex: 'avgPrice' },
         { id: 'pl', label: 'P&L', dataIndex: 'pl' },
      ],
      historyColumns: [],
      pages: [
          { id: 'orders', title: 'Orders', tables: [{ id: 'orders', columns: 'orderColumns' }] },
          { id: 'positions', title: 'Positions', tables: [{ id: 'positions', columns: 'positionColumns' }] },
      ]
    };
  }

  async placeOrder(order) {
    console.log('BrokerAdapter: placeOrder', order);
    return {};
  }

  async modifyOrder(order) {
    console.log('BrokerAdapter: modifyOrder', order);
    return {};
  }

  async cancelOrder(orderId) {
    console.log('BrokerAdapter: cancelOrder', orderId);
    return {};
  }

  async closePosition(positionId) {
    console.log('BrokerAdapter: closePosition', positionId);
    return {};
  }
  
  async symbolInfo(symbol) {
    // 返回最基础的合约信息，确保下单面板能计算数量
    return {
        qty: { min: 0.00000001, max: 1000000, step: 0.00000001 },
        pipValue: 1,
        pipSize: 0.01,
        minTick: 0.01,
        description: symbol,
    };
  }
  
  subscribeEquity() {}
  unsubscribeEquity() {}
  subscribeMarginAvailable() {}
  unsubscribeMarginAvailable() {}
}

