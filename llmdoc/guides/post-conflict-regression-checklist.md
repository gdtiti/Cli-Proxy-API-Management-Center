# 冲突后回归检查清单

适用场景：完成一次多文件冲突合并后，快速确认功能、类型和构建都没有回退。

## 1) Git 状态检查（必须）

- 确认无未解决冲突：`git diff --name-only --diff-filter=U`
- 确认当前工作区状态：`git status --porcelain=v1`
- 抽查是否仍有冲突标记：搜索 `<<<<<<<` / `=======` / `>>>>>>>`

## 2) 类型与构建检查（必须）

- 类型检查：`pnpm type-check`
- 构建检查：`pnpm build`
- 若构建日志有环境噪音（如 `The system cannot find the path specified.`），以最终退出状态为准；失败时再单独定位

代码锚点：`package.json:8`、`package.json:12`

## 3) 页面级功能回归（高价值）

- 路由可达：关键页面至少打开一次（如 `/ai-providers`、`/quota`、`/usage`）
- 列表操作正确：编辑/删除/开关操作对象与预期一致（尤其在过滤视图下）
- 数据展示正确：统计卡片、图表、表格都能渲染且无明显空白异常
- 错误态可见：接口失败时有可感知提示，不出现白屏

代码锚点：`src/router/MainRoutes.tsx:23`

## 4) i18n 检查（建议）

- 三语 key 同步：`en` / `zh-CN` / `ru` 保持新增键一致
- 避免重复 key：同一命名空间下不重复定义
- 避免非法 JSON：逗号与引号完整，能被正常解析

代码锚点：`src/i18n/locales/en.json:1`、`src/i18n/locales/zh-CN.json:1`、`src/i18n/locales/ru.json:1`

## 5) 类型模型冲突专项（建议）

当冲突是"payload 模型 vs view 模型"时，不建议二选一：

- payload 类型：用于承接后端返回结构
- view 类型：用于页面展示和交互态
- parser 层：负责 payload -> view 的转换

以 Kiro quota 为例，冲突后应确保两类消费者都可工作：

- 通用配额卡片链路（依赖 payload 结构）
- 旧页面详情链路（依赖聚合展示字段）

代码锚点：`src/types/quota.ts:1`、`src/utils/quota/parsers.ts:1`、`src/components/quota/quotaConfigs.ts:933`、`src/pages/quota/KiroQuotaSection.tsx:1`

## 6) 配额模块专项检查（高优先级）

适用场景：合并涉及 `QuotaSection` 或远端新增「批量刷新」「摘要标签」「进度面板」等功能。

### 双轨刷新机制

- [ ] 顺序检查模式：入口可见，调用 `refreshAllQuota` 正确
- [ ] 并发模态框模式：点击凭证打开模态，多源并发刷新
- [ ] 无竞态：两种模式切换时无重复请求或状态错乱

代码锚点：`src/components/quota/QuotaSection/hooks/useQuotaRefresh.ts:45`、`src/components/quota/QuotaSection/index.tsx:85`

### 摘要/凭证标签 + 状态过滤

- [ ] 标签切换正常："摘要"与"凭证"标签可点击切换
- [ ] 状态过滤联动：标签页内状态筛选器（有效/即将过期/已过期）工作正常
- [ ] 过滤计数：各状态下显示匹配条数

代码锚点：`src/components/quota/QuotaSection/index.tsx:143`、`src/components/quota/QuotaSection/index.tsx:175`

### 分页与视图控制

- [ ] 分页控制：页码切换、每页条数选择（10/20/50）有效
- [ ] 视图模式持久化：卡片/列表视图切换后刷新保留
- [ ] 状态保持：筛选/分页/视图组合刷新不丢失

代码锚点：`src/components/quota/QuotaSection/index.tsx:230`、`src/hooks/useViewMode.ts:1`

### 进度面板验证

- [ ] 批量进度面板：批量刷新时显示进度与成功/失败计数
- [ ] 刷新进度面板：模态框内单源/多源刷新进度可见
- [ ] 完成后自动收起：进度 100% 后适当延迟消失

代码锚点：`src/components/quota/QuotaSection/components/BatchProgress.tsx:1`、`src/components/quota/QuotaSection/components/RefreshProgress.tsx:1`

### i18n 完整性

- [ ] 新增 28 个 key 已同步到 `en/zh-CN/ru`
- [ ] `quota_management.*` 命名空间下无重复或缺失
- [ ] 进度/状态/过滤相关文案均有翻译

代码锚点：`src/i18n/locales/en.json:720`、`src/i18n/locales/zh-CN.json:720`、`src/i18n/locales/ru.json:720`

## 7) 合并完成判定

满足以下条件即可进入提交阶段：

- `git diff --name-only --diff-filter=U` 为空
- `pnpm type-check` 通过
- `pnpm build` 通过
- 关键页面手测通过
