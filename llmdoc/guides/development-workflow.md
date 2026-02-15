# 开发工作流

## 本地开发

1. 安装依赖：`pnpm install`
2. 启动开发环境：`pnpm dev`
3. 类型检查：`pnpm type-check`
4. 代码检查：`pnpm lint`
5. 构建验证：`pnpm build`

代码锚点：`package.json:6`、`package.json:8`、`package.json:12`

## 常见修改路径

- 新增页面：
  - 在 `src/pages/` 创建页面组件
  - 在 `src/router/MainRoutes.tsx` 注册路由
- 新增 API：
  - 在 `src/services/api/` 新增模块
  - 在 `src/services/api/index.ts` 统一导出
- 新增全局状态：
  - 在 `src/stores/` 新建 store
  - 在 `src/stores/index.ts` 统一导出

代码锚点：`src/router/MainRoutes.tsx:23`、`src/services/api/index.ts:1`、`src/stores/index.ts:5`

## 多语言文案更新

- 主要语言文件位于 `src/i18n/locales/`
- 新增页面文案时，保持各语言 key 一致
- 涉及业务关键功能时，优先补齐 `en/zh-CN/ru` 三份词条

代码锚点：`src/i18n/locales/en.json:1`、`src/i18n/locales/zh-CN.json:1`、`src/i18n/locales/ru.json:1`

## 冲突处理流程（Git）

1. 拉取后先检查冲突清单：`git status --porcelain=v1`、`git diff --name-only --diff-filter=U`
2. 避免全量覆盖，按文件/按块合并：优先保留本地已验证功能，再补入远端新增能力
3. 先解决核心链路（页面 + hook + i18n），再处理重构型大文件
4. 清理冲突标记并暂存：确保无 `<<<<<<<` / `=======` / `>>>>>>>` 后再 `git add`
5. 最后做功能回归：至少跑 `pnpm type-check` 与 `pnpm build`

冲突高频锚点：`src/pages/UsagePage.tsx:1`、`src/components/usage/hooks/useUsageData.ts:1`、`src/i18n/locales/en.json:1`

## 提交前检查建议

- 页面路由是否可访问
- i18n key 是否缺失
- 核心页面在桌面和移动端均可用
- `pnpm type-check` 与 `pnpm build` 通过

代码锚点：`src/router/MainRoutes.tsx:65`、`package.json:12`、`package.json:8`
