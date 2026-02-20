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

### 逐块合并冲突（推荐）

适用场景：同一文件同时存在功能演进与结构重构，直接选 ours/theirs 会丢功能或引入回退。

分级顺序（先低风险，后高风险）：

1. 低风险：`.gitignore` / `README` / 纯格式调整
2. 中风险：`i18n` 文案、类型守卫（type guard）
3. 高风险：页面功能重构、类型模型变更

执行步骤与验收命令：

1. 每完成一批文件后先确认是否还有未解冲突：`git diff --name-only --diff-filter=U`
2. 全部冲突清理后做类型验收：`pnpm type-check`
3. 最终做构建验收：`pnpm build`

冲突不要“二选一”（本次 Kiro quota 类型冲突示例）：

- 目标不是只保留 payload 或只保留 view，而是两套模型并存
- API payload 模型负责承接接口字段，view 模型负责页面展示/交互
- 在 parser 层做显式转换，避免页面直接耦合后端字段细节

本次实战结果（可复用基线）：

- 已无未解决冲突（`git diff --name-only --diff-filter=U` 为空）
- 验证通过：`pnpm type-check`、`pnpm build` 均成功
- 构建日志出现两行 `The system cannot find the path specified.`，但不影响最终构建成功

### 功能合并案例：配额管理模块

场景：远端新增「批量刷新」「摘要/凭证标签」「状态过滤」「分页控制」「进度面板」等功能，本地有独立的「视图模式持久化」实现。

合并策略：保留双方核心能力，非二选一。

| 功能          | 处理方式                           | 验证锚点                     |
| ------------- | ---------------------------------- | ---------------------------- |
| 双轨刷新机制  | 顺序全量检查 + 并发模态框刷新并存  | `QuotaSection/index.tsx:85`  |
| 摘要/凭证标签 | 保留远端新增，补充 i18n key        | `QuotaSection/index.tsx:143` |
| 状态过滤      | 与本地标签过滤共存                 | `QuotaSection/index.tsx:175` |
| 分页控制      | 保留远端，与本地视图模式联动       | `QuotaSection/index.tsx:230` |
| 进度面板      | 批量进度 + 刷新进度并存            | `QuotaSection/index.tsx:315` |
| i18n 词条     | 新增 28 个 `quota_management.*` 键 | `i18n/locales/en.json:720`   |

合并原则：

1. **识别价值边界**：远端提供的是业务功能，本地提供的是体验优化
2. **分层隔离**：UI 组件层独立，共享同一数据层（hooks）
3. **渐进式整合**：先保持并行工作，后续迭代再做抽象统一
4. **回归验证**：冲突解决后必须跑「配额页面回归清单」

代码锚点：`llmdoc/guides/post-conflict-regression-checklist.md`（配额模块专项）

## 提交前检查建议

- 页面路由是否可访问
- i18n key 是否缺失
- 核心页面在桌面和移动端均可用
- `pnpm type-check` 与 `pnpm build` 通过

代码锚点：`src/router/MainRoutes.tsx:65`、`package.json:12`、`package.json:8`
