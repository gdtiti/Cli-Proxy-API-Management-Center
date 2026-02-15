# 项目概览

## 项目定位

`Cli-Proxy-API-Management-Center` 是一个基于 React + TypeScript + Vite 的 Web 管理界面，用于管理 CLI Proxy API 的配置、认证文件、AI Provider、日志与用量数据。

## 核心能力

- 配置管理（`/config`）
- AI Providers 管理（`/ai-providers` 及各 Provider 编辑页）
- 认证文件管理（`/auth-files`）
- OAuth 与配额管理（`/oauth`、`/quota`）
- 监控与用量统计（`/monitor`、`/usage`）
- 系统与日志页面（`/system`、`/logs`）

## 技术栈

- 前端框架：React 19
- 语言：TypeScript
- 构建工具：Vite
- 路由：`react-router-dom`（HashRouter）
- 状态管理：Zustand
- 国际化：i18next + react-i18next
- 图表：Chart.js + react-chartjs-2

## 启动入口

- 应用入口：`src/main.tsx:1`
- 应用壳：`src/App.tsx:1`
- 主路由定义：`src/router/MainRoutes.tsx:1`

## 代码锚点

- 启动挂载与 favicon：`src/main.tsx:7`、`src/main.tsx:21`
- Router 壳与全局容器：`src/App.tsx:30`、`src/App.tsx:31`、`src/App.tsx:33`
- 主路由表定义：`src/router/MainRoutes.tsx:23`
