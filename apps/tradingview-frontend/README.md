# TradingView 前端

## 目录结构
```
frontend/
  public/
    index.html
    charting_library -> ../../charting_library
    datafeed.js (指向 src/datafeed/datafeed.js)
  src/
    datafeed/
      datafeed.js
```

## 启动步骤
1. 在 `frontend` 目录执行 `npm install`，安装 `serve`。
2. 运行 `npm run dev`（或 `npm start`）以 `http://localhost:8080` 启动静态服务。
3. 确保根目录存在 `charting_library` 资源（或更新符号链接指向正确路径）。
4. 打开浏览器访问 `http://localhost:8080`，TradingView 小部件会自动初始化，数据由 `http://localhost:3002` 提供。
