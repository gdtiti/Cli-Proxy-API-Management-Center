# 状态与 API 架构

## 状态管理（Zustand）

- 统一导出：`src/stores/index.ts`
- 主要 store：
  - `useAuthStore`：连接状态、服务端版本、基础地址等
  - `useConfigStore`：系统配置数据
  - `useModelsStore`：模型列表与加载状态
  - `useThemeStore`：主题状态与初始化
  - `useLanguageStore`：语言切换
  - `useQuotaStore`、`useDisabledModelsStore`：配额与禁用模型相关状态

代码锚点：`src/stores/index.ts:5`、`src/stores/index.ts:14`

## API 分层

- API 导出入口：`src/services/api/index.ts`
- 模块化 API：
  - `client`、`apiCall`（请求基础能力）
  - `config`、`configFile`
  - `apiKeys`、`providers`、`authFiles`、`oauth`
  - `usage`、`logs`、`version`、`models`、`vertex`

代码锚点：`src/services/api/index.ts:1`、`src/services/api/index.ts:16`

## 页面调用模式（典型）

- 页面通过 store 读取全局状态
- 页面或 hook 调用 `src/services/api/*` 请求数据
- 组件消费页面整理后的数据进行展示

该模式可在 `src/pages/DashboardPage.tsx` 中看到：

- 组合使用 `useAuthStore/useConfigStore/useModelsStore`
- 通过 `apiKeysApi/providersApi/authFilesApi` 并行获取统计
- 将统计结果映射为仪表卡片数据

代码锚点：`src/pages/DashboardPage.tsx:10`、`src/pages/DashboardPage.tsx:11`、`src/pages/DashboardPage.tsx:131`
