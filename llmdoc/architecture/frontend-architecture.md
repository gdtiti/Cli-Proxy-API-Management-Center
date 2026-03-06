# 前端架构

## 启动与应用壳

- 入口文件：`src/main.tsx`
  - 挂载 React 应用
  - 设置页面标题与 favicon
- 根组件：`src/App.tsx`
  - 使用 `HashRouter`
  - 注册全局通知与确认弹窗容器
  - 通过 `ProtectedRoute` 保护主布局

代码锚点：`src/main.tsx:21`、`src/App.tsx:30`、`src/App.tsx:38`

## 路由结构

- 主路由集中在 `src/router/MainRoutes.tsx`
- 默认首页路由为 `/`，映射到 `MonitorPage`
- 主要业务路由：
  - `/dashboard`
  - `/ai-providers/*`
  - `/auth-files`
  - `/oauth`
  - `/quota`
  - `/config`
  - `/logs`
  - `/system`
  - `/monitor`
  - `/usage`

代码锚点：`src/router/MainRoutes.tsx:23`、`src/router/MainRoutes.tsx:24`、`src/router/MainRoutes.tsx:65`

## 页面与组件分层

- 页面层：`src/pages/*`
  - 负责页面编排、数据聚合、交互流程
- 组件层：`src/components/*`
  - UI 组件、业务组件、布局组件
- 样式：
  - 全局样式：`src/styles/global.scss`
  - 页面级样式：`*.module.scss`

代码锚点：`src/pages/DashboardPage.tsx:30`、`src/components/layout/MainLayout.tsx:1`

## 国际化与主题

- 国际化：通过 `react-i18next` 在页面中调用 `t()`
- 主题：由 `useThemeStore` 管理，应用初始化时同步

代码锚点：`src/App.tsx:8`、`src/App.tsx:11`、`src/pages/DashboardPage.tsx:31`

## 应用启动时的语言 / 主题同步

- `App` 启动时先调用 `useThemeStore(...initializeTheme)`，由 store 负责应用当前主题并注册系统主题监听：`src/App.tsx:38-45`、`src/stores/useThemeStore.ts:60-83`
- `App` 只在 `i18n.language !== language` 时调用 `i18n.changeLanguage(language)`，避免把已同步的语言再次写回 store：`src/App.tsx:47-51`
- 文档根节点语言属性仍由独立 effect 维护，仅同步 `document.documentElement.lang`：`src/App.tsx:53-55`

### 2026-03 已落地修复：首屏初始化更新环

- 已修复一次 React 运行时错误 `Maximum update depth exceeded`，根因是首屏初始化阶段 language store 与 i18next 的同步形成重复更新链
- 当前实现把语言写入职责收敛到 `useLanguageStore.setLanguage`，而 `App` 侧只做“必要时同步 i18n”的幂等检查：`src/stores/useLanguageStore.ts:24-33`、`src/App.tsx:47-51`
- 该修复仅覆盖启动同步链路，不改变路由、页面层或 i18n 资源组织方式
