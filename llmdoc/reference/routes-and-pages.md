# 路由与页面速查

路由定义来源：`src/router/MainRoutes.tsx`

代码锚点：`src/router/MainRoutes.tsx:23`

## 主路由

- `/` -> `MonitorPage`
- `/dashboard` -> `DashboardPage`
- `/ai-providers` -> `AiProvidersPage`
- `/ai-providers/gemini/new|:index` -> `AiProvidersGeminiEditPage`
- `/ai-providers/codex/new|:index` -> `AiProvidersCodexEditPage`
- `/ai-providers/claude/new|:index` -> `AiProvidersClaudeEditPage`
- `/ai-providers/vertex/new|:index` -> `AiProvidersVertexEditPage`
- `/ai-providers/openai/new` -> `AiProvidersOpenAIEditLayout` + 子路由
- `/ai-providers/openai/:index` -> `AiProvidersOpenAIEditLayout` + 子路由
- `/ai-providers/ampcode` -> `AiProvidersAmpcodeEditPage`
- `/auth-files` -> `AuthFilesPage`
- `/auth-files/oauth-excluded` -> `AuthFilesOAuthExcludedEditPage`
- `/auth-files/oauth-model-alias` -> `AuthFilesOAuthModelAliasEditPage`
- `/oauth` -> `OAuthPage`
- `/quota` -> `QuotaPage`
- `/config` -> `ConfigPage`
- `/logs` -> `LogsPage`
- `/system` -> `SystemPage`
- `/monitor` -> `MonitorPage`
- `/usage` -> `UsagePage`

## 路由说明

- 未匹配路由统一重定向到 `/`
- 部分历史入口（如 `/settings`、`/api-keys`）已重定向到 `/config`

代码锚点：`src/router/MainRoutes.tsx:26`、`src/router/MainRoutes.tsx:27`、`src/router/MainRoutes.tsx:65`
