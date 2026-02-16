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

当冲突是“payload 模型 vs view 模型”时，不建议二选一：

- payload 类型：用于承接后端返回结构
- view 类型：用于页面展示和交互态
- parser 层：负责 payload -> view 的转换

以 Kiro quota 为例，冲突后应确保两类消费者都可工作：

- 通用配额卡片链路（依赖 payload 结构）
- 旧页面详情链路（依赖聚合展示字段）

代码锚点：`src/types/quota.ts:1`、`src/utils/quota/parsers.ts:1`、`src/components/quota/quotaConfigs.ts:933`、`src/pages/quota/KiroQuotaSection.tsx:1`

## 6) 合并完成判定

满足以下条件即可进入提交阶段：

- `git diff --name-only --diff-filter=U` 为空
- `pnpm type-check` 通过
- `pnpm build` 通过
- 关键页面手测通过
