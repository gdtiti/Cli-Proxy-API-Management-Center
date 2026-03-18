# llmdoc

本目录是项目的工程文档入口，按「概览 → 架构 → 指南 → 参考」组织。

## 阅读顺序

1. `llmdoc/overview/project-overview.md` - 项目是什么、解决什么问题
2. `llmdoc/architecture/frontend-architecture.md` - 前端整体结构与路由分层
3. `llmdoc/architecture/state-and-api.md` - 状态管理、全局通知/确认流、启动期订阅约束与自动登录幂等边界
4. `llmdoc/guides/development-workflow.md` - 常见开发工作流
5. `llmdoc/guides/release-management-html.md` - 管理界面 `management.html` 的标准发布流程
6. `llmdoc/guides/post-conflict-regression-checklist.md` - 冲突合并后的回归检查清单
7. `llmdoc/reference/routes-and-pages.md` - 页面路由与功能入口速查
8. `llmdoc/reference/scripts-and-dependencies.md` - 构建脚本、测试入口与发布约定速查

## 文档约定

- 代码引用尽量使用 `path:line` 形式
- 先描述事实，再写建议
- 仅记录已在仓库中存在的行为，避免推测

## 发布与交付入口

- 标准发布流程：`llmdoc/guides/release-management-html.md`
- 构建脚本与测试入口：`llmdoc/reference/scripts-and-dependencies.md`
- 对外中文说明：`README_CN.md#构建与发布说明`

## 冲突排障入口

- 冲突处理主流程：`llmdoc/guides/development-workflow.md`
- 逐块合并冲突（推荐）：`llmdoc/guides/development-workflow.md#逐块合并冲突推荐`
- 冲突后回归检查清单：`llmdoc/guides/post-conflict-regression-checklist.md`
- 路由冲突定位：`llmdoc/reference/routes-and-pages.md`
- 状态/API 冲突定位：`llmdoc/architecture/state-and-api.md`
- 页面结构冲突定位：`llmdoc/architecture/frontend-architecture.md`
