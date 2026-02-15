# 脚本与依赖速查

来源：`package.json`

代码锚点：`package.json:6`、`package.json:14`、`package.json:34`

## 常用脚本

- `pnpm dev`：启动 Vite 开发服务器
- `pnpm build`：`tsc && vite build`
- `pnpm preview`：预览构建产物
- `pnpm lint`：ESLint 检查
- `pnpm format`：Prettier 格式化 `src/**/*.{ts,tsx,css,scss}`
- `pnpm type-check`：TypeScript 无输出检查

代码锚点：`package.json:7`、`package.json:12`

## 核心运行时依赖

- `react`、`react-dom`
- `react-router-dom`
- `zustand`
- `axios`
- `i18next`、`react-i18next`
- `chart.js`、`react-chartjs-2`

代码锚点：`package.json:14`、`package.json:33`

## 构建与工程化依赖

- `vite`、`@vitejs/plugin-react`
- `typescript`
- `eslint` + `@typescript-eslint/*`
- `prettier`
- `sass`

代码锚点：`package.json:34`、`package.json:52`
