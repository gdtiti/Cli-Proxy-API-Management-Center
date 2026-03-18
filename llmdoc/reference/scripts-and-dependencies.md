# 脚本与依赖速查

来源：`package.json`

代码锚点：`package.json:6`、`package.json:15`、`package.json:36`

## 常用脚本

- `pnpm dev`：启动 Vite 开发服务器
- `pnpm build`：`tsc && vite build`
- `pnpm preview`：预览构建产物
- `pnpm test`：运行 `scripts/tests` 下的 Node 测试
- `pnpm lint`：ESLint 检查
- `pnpm format`：Prettier 格式化 `src/**/*.{ts,tsx,css,scss}`
- `pnpm type-check`：TypeScript 无输出检查

代码锚点：`package.json:7`、`package.json:13`

## 发布相关脚本与约定

- 本地正式构建前，优先执行：`pnpm type-check`、`pnpm test`
- 本地发布验证命令（PowerShell）：`$env:VERSION='vX.Y.Z'; pnpm run build`
- 本地产物固定为 `dist/index.html`，不会在本地直接生成 `management.html`
- GitHub Actions 在 tag `v*` 时触发，构建后把 `dist/index.html` 重命名为 `dist/management.html`，再上传到 Release
- UI 版本号的注入优先级为：`VERSION` 环境变量 → git tag → `package.json`
- 详细步骤见：`llmdoc/guides/release-management-html.md`

代码锚点：`vite.config.ts:11`、`vite.config.ts:48`、`vite.config.ts:67`、`.github/workflows/release.yml:3`、`.github/workflows/release.yml:31`、`.github/workflows/release.yml:36`、`.github/workflows/release.yml:56`

## 核心运行时依赖

- `react`、`react-dom`
- `react-router-dom`
- `zustand`
- `axios`
- `i18next`、`react-i18next`
- `chart.js`、`react-chartjs-2`

代码锚点：`package.json:15`、`package.json:34`

## 构建与工程化依赖

- `vite`、`@vitejs/plugin-react`
- `vite-plugin-singlefile`
- `typescript`
- `eslint` + `@typescript-eslint/*`
- `prettier`
- `sass`

代码锚点：`package.json:36`、`package.json:53`
