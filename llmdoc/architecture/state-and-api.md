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

### 语言与主题 store 的幂等约束

- `useLanguageStore.setLanguage` 会先校验目标语言是否合法，再在目标语言与当前值不同时才调用 `i18n.changeLanguage` 和 Zustand `set`：`src/stores/useLanguageStore.ts:24-33`
- `useThemeStore.setTheme` 会先计算 `resolvedTheme` 并应用到 DOM；只有 `theme` 或 `resolvedTheme` 发生变化时才写回 store：`src/stores/useThemeStore.ts:42-50`
- `useThemeStore.initializeTheme` 启动时复用 `setTheme(theme)`，随后注册 `matchMedia('(prefers-color-scheme: dark)')` 监听：`src/stores/useThemeStore.ts:60-83`

### 2026-03 运行时修复记录

- 已验证修复 `Maximum update depth exceeded`：问题出现在首屏阶段 store 初始化与外部同步重复触发更新
- 当前边界是：store action 负责实际写入，`App` 负责必要的只读同步检查，避免出现 `store -> effect -> store` 循环：`src/App.tsx:47-51`、`src/stores/useLanguageStore.ts:24-33`
- 额外为主题 store 增加幂等保护，降低初始化和系统主题变化时的重复更新风险：`src/stores/useThemeStore.ts:42-50`
- 本次修复已按现有工程脚本验收通过：`pnpm type-check`、`pnpm build`；构建中的两行 `The system cannot find the path specified.` 仍属于已知环境噪音，参考 `llmdoc/guides/development-workflow.md:70-71` 与 `llmdoc/guides/post-conflict-regression-checklist.md:13-15`

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
