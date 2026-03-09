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

### 全局通知 / 确认容器

- `RootShell` 在路由出口外层统一挂载 `NotificationContainer` 与 `ConfirmationModal`，因此登录页与受保护区域共享同一套全局通知/确认入口，而不是由页面各自注入：`src/App.tsx:11-17`、`src/App.tsx:21-35`
- `NotificationContainer` 只订阅 `notifications` 与 `removeNotification`，本地维护进入/退出动画状态；真正删除通知仍回到 store 的 `removeNotification()`，保持 UI 动画与全局状态更新边界分离：`src/components/common/NotificationContainer.tsx:12-18`、`src/components/common/NotificationContainer.tsx:60-69`
- `ConfirmationModal` 现在按字段分别订阅 `confirmation.isOpen`、`confirmation.isLoading`、`confirmation.options`，避免因为整个确认对象换引用而扩大重渲染面：`src/components/common/ConfirmationModal.tsx:6-12`
- 确认按钮的异步流程是：先调用 `setConfirmationLoading(true)`，成功后直接 `hideConfirmation()`；由于关闭动作已负责把 `isLoading` 复位为 `false`，成功分支不再额外调用一次 `setConfirmationLoading(false)`，只有确认失败时才显式恢复 loading：`src/components/common/ConfirmationModal.tsx:28-42`、`src/stores/useNotificationStore.ts:90-113`
- 取消关闭仍受 `isLoading` 保护：加载中时 `handleCancel()` 直接返回，弹窗的遮罩关闭能力也通过 `Modal.closeDisabled` 与相同状态对齐：`src/components/common/ConfirmationModal.tsx:45-56`、`src/components/ui/Modal.tsx:102-129`

## 登录页与启动期认证恢复

- `/login` 由 `LoginPage` 负责显示启动 splash、恢复持久化会话、以及自动登录成功后的延迟跳转：`src/App.tsx:25`、`src/pages/LoginPage.tsx:76-179`
- 受保护区域只由 `ProtectedRoute` 判断 hydration 和认证态；当前实现不再在 mount 时主动触发 `checkAuth()`，避免与登录页形成双重驱动：`src/router/ProtectedRoute.tsx:6-23`
- 启动期的职责边界已收敛为：
  1. `ProtectedRoute` 只负责“未完成 hydration 时显示 loading，未认证时跳 `/login`”
  2. `LoginPage` 作为自动恢复入口，调用 `restoreSession()` 后决定继续 splash、回填表单或跳转：`src/pages/LoginPage.tsx:139-179`
  3. `useAuthStore.restoreSession()` 负责读取持久化凭据、配置 `apiClient`、尝试自动登录，并在 promise 结束后释放并发锁：`src/stores/useAuthStore.ts:45-110`

### 2026-03 启动链路修复：单一入口恢复会话

- 本轮修复确认：自动登录不再由路由守卫和登录页同时触发，避免启动期出现重复认证检查、重复写状态和 splash 无法退出的问题：`src/router/ProtectedRoute.tsx:11-23`、`src/pages/LoginPage.tsx:148-166`
- 登录页不再被 client cache hydration 阻塞；登录表单相关状态在 `restoreSession()` 返回 false 后直接按持久化值或 location 推导值回填：`src/pages/LoginPage.tsx:159-166`
- `restoreSession()` 在自动登录失败时会显式写回 `isAuthenticated: false`、错误连接状态并清除 `isLoggedIn`，防止旧失败状态残留：`src/stores/useAuthStore.ts:79-101`
- `restoreSessionPromise` 会在 `finally` 中重置，保证节点切换或下一次访问不会被上一轮失败请求锁死：`src/stores/useAuthStore.ts:105-109`

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
