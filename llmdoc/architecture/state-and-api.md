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

### 全局通知与确认状态

- `useNotificationStore` 同时承载 toast 列表与全局确认弹窗状态；确认态由 `confirmation.isOpen`、`confirmation.isLoading`、`confirmation.options` 三个字段组成：`src/stores/useNotificationStore.ts:22-35`、`src/stores/useNotificationStore.ts:37-43`
- `showNotification()` 创建通知后仍按 `duration` 启动自动移除，但定时回调现在统一复用 `removeNotification(id)`，不再在超时分支复制筛选逻辑：`src/stores/useNotificationStore.ts:45-63`
- `removeNotification()` 在目标 id 不存在时返回原 `notifications` 引用，`clearAll()` 在列表已空时同样返回原数组；这两个分支把“无实际变化不换引用”明确收敛到 store action 内：`src/stores/useNotificationStore.ts:66-77`
- `hideConfirmation()` 在确认框已关闭且 `options` 已为空时返回现有 `confirmation` 对象；真正关闭时会同时把 `isOpen` 置为 `false`、清空 `options`，并将 `isLoading` 一并复位为 `false`：`src/stores/useNotificationStore.ts:90-101`
- `setConfirmationLoading()` 仅在 loading 标志变化时创建新 `confirmation` 对象；相同值写回会直接复用原引用，减少确认流程中的无效广播：`src/stores/useNotificationStore.ts:104-113`

### 启动期订阅约束

- 启动路径上的组件和 hooks 现在统一采用“按字段/按 action 订阅”，避免整体订阅 store 或在 selector 中执行会返回新引用的函数
- 明确禁止在 Zustand selector 中调用会返回新对象/新数组的 store 方法；例如 `useClientCacheStore((state) => state.getClients())` 会在每次快照比较时生成新数组，触发 `useSyncExternalStore` 持续判定快照变化，最终可能导致 `Maximum update depth exceeded`。当前实现改为直接订阅 `state.clients`：`src/components/client/ClientManagementModal.tsx:18-25`、`src/stores/useClientCacheStore.ts:142-152`
- 同类修复已覆盖启动和登录链路上的高频节点：
  - 通知 hook 只订阅 `showNotification`：`src/hooks/useApi.ts:24-57`
  - `ConfirmationModal` 不再整体订阅 `state.confirmation`，而是分别订阅 `isOpen` / `isLoading` / `options`，把确认弹窗也纳入按字段订阅约束：`src/components/common/ConfirmationModal.tsx:6-12`
  - 禁用模型 hook 分别订阅 `addDisabledModel` / `isDisabled`：`src/hooks/useDisableModel.ts:59-62`
  - 系统页按字段订阅 auth / notification store：`src/pages/SystemPage.tsx:45-64`
  - 之前已修复 `NotificationContainer`、`MainLayout`、`LoginPage`、`useClientKeyboardShortcuts` 等启动路径节点：`src/components/common/NotificationContainer.tsx:12-58`、`src/components/layout/MainLayout.tsx:182-199`、`src/pages/LoginPage.tsx:80-89`、`src/stores/useClientKeyboardShortcuts.ts:9-48`

### 自动登录与 store 幂等要求

- `useAuthStore.restoreSession()` 会先解析持久化的 `apiBase` / `managementKey` / `rememberPassword`，仅在解析结果与当前 store 不一致时才写回，避免启动期无变化重复 `set`：`src/stores/useAuthStore.ts:58-77`
- 自动登录失败必须回退到可重试状态：清理 `isLoggedIn`、写回 `isAuthenticated: false` 和错误连接信息，并释放 `restoreSessionPromise`：`src/stores/useAuthStore.ts:79-107`
- `useLanguageStore.setLanguage` 与 `useThemeStore.setTheme` 已具备幂等保护；`App` 仅同步外部实例，不再把语言在首屏 effect 中写回 store：`src/stores/useLanguageStore.ts:24-34`、`src/stores/useThemeStore.ts:42-50`、`src/App.tsx:47-55`

### 语言与主题 store 的幂等约束

- `useLanguageStore.setLanguage` 会先校验目标语言是否合法，再在目标语言与当前值不同时才调用 `i18n.changeLanguage` 和 Zustand `set`：`src/stores/useLanguageStore.ts:24-33`
- `useThemeStore.setTheme` 会先计算 `resolvedTheme` 并应用到 DOM；只有 `theme` 或 `resolvedTheme` 发生变化时才写回 store：`src/stores/useThemeStore.ts:42-50`
- `useThemeStore.initializeTheme` 启动时复用 `setTheme(theme)`，随后注册 `matchMedia('(prefers-color-scheme: dark)')` 监听：`src/stores/useThemeStore.ts:60-83`

### 2026-03 运行时修复记录

- 已验证修复 `Maximum update depth exceeded`：问题出现在首屏阶段 store 初始化与外部同步重复触发更新
- 当前边界是：store action 负责实际写入，`App` 负责必要的只读同步检查，避免出现 `store -> effect -> store` 循环：`src/App.tsx:47-51`、`src/stores/useLanguageStore.ts:24-33`
- 额外为主题 store 增加幂等保护，降低初始化和系统主题变化时的重复更新风险：`src/stores/useThemeStore.ts:42-50`
- 本轮又补齐了登录页 / 启动路径上的订阅与自动恢复修复，验证结果包括：`pnpm type-check` 通过，且 `http://localhost:5173/#/login` 已可正常打开，不再出现 `Maximum update depth exceeded`

## 启动期状态与认证恢复检查清单

1. selector 只返回稳定字段或稳定 action；不要在 selector 内执行 `getClients()`、`map()`、对象解构聚合等会制造新引用的逻辑：`src/components/client/ClientManagementModal.tsx:20-24`
2. 自动恢复必须只有一个入口；当前入口是 `LoginPage`，`ProtectedRoute` 不负责发起恢复：`src/pages/LoginPage.tsx:139-179`、`src/router/ProtectedRoute.tsx:11-23`
3. store setter 必须具备幂等性；无变化时直接 return，避免首屏 effect 和持久化 rehydrate 相互放大：`src/stores/useAuthStore.ts:66-77`、`src/stores/useLanguageStore.ts:28-33`、`src/stores/useThemeStore.ts:42-50`
4. 自动恢复失败后必须清理登录标记并解除 promise 锁，否则后续节点切换可能持续复用旧失败结果：`src/stores/useAuthStore.ts:87-107`

## API 超时配置

- 可配置的超时参数支持，用于解决大量认证文件加载超时问题
- 配置字段：
  - `apiTimeout`: 通用 API 超时（毫秒），默认 30 秒
  - `authFilesTimeout`: 认证文件列表专用超时（毫秒），默认 60 秒
- 配置存储于 Config 类型，通过 VisualConfigEditor 界面可调整
- 认证文件列表 API (`authFilesApi.list()`) 使用可配置超时
- 超时配置通过 localStorage 持久化，支持运行时动态更新

代码锚点：

- `src/types/config.ts:37-40` - Config 类型超时字段定义
- `src/types/visualConfig.ts:65-66` - VisualConfigValues 超时字段
- `src/services/api/authFiles.ts:102-119` - 可配置超时实现
- `src/components/config/VisualConfigEditor.tsx:261-287` - 超时配置 UI

## 配额管理

- 配额管理页面位于 `/quota`，支持多类型配额查看和设置
- 支持额度类型：
  - `gemini` - Gemini API 额度
  - `claude` - Claude API 额度
  - `codex` - Codex API 额度
  - `kiro` - Kiro (AWS CodeWhisperer) 额度
  - `vertex` - Vertex AI 额度
  - `openai` - OpenAI 兼容额度
- 配置定义位于 `src/components/quota/quotaConfigs.ts`
- 页面组件：`src/pages/QuotaPage.tsx`
- 配额卡片组件：`src/components/quota/QuotaSection.tsx`

### Kiro 额度特殊处理

- Kiro 额度曾使用独立的 `KiroQuotaSection` 组件
- 2025-02 优化：统一使用通用 `QuotaSection` 组件渲染
- 删除了重复的 `KiroQuotaSection` 渲染，解决双块显示问题

代码锚点：

- `src/components/quota/quotaConfigs.ts:1047-1079` - KIRO_CONFIG 定义
- `src/pages/QuotaPage.tsx:80-114` - 配额页面渲染
- `src/components/quota/QuotaSection.tsx:397-408` - 配额卡片标题渲染

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

## 菜单与导航

### 侧边栏菜单

- 侧边栏组件：`src/components/layout/MainLayout.tsx`
- 菜单项配置在 `navItems` 数组中定义（约第 351-364 行）
- 图标映射：`sidebarIcons` 对象（第 39-49 行）

### 菜单项配置

每个菜单项包含：

- `path`: 路由路径
- `icon`: 图标组件引用
- `label`: i18n 翻译键

### 修复历史

**2025-02 菜单修复：**

1. **使用统计菜单图标缺失**
   - 问题：`sidebarIcons` 映射缺少 `usage` 键
   - 修复：添加 `usage: <IconChartLine />` 到 `sidebarIcons`

2. **Monitor 菜单激活状态异常**
   - 问题：根路径 `/` 菜单在所有页面都显示激活
   - 修复：为 NavLink 添加 `end` 属性，实现精确匹配

3. **监控页面双入口混乱**
   - 问题：`/` 和 `/monitor` 都指向 MonitorPage
   - 修复：将 `/` 改为重定向到 `/monitor`

代码锚点：

- `src/components/layout/MainLayout.tsx:359` - 菜单项渲染
- `src/components/layout/MainLayout.tsx:39-49` - 图标映射
- `src/router/MainRoutes.tsx:26,79` - 路由定义
