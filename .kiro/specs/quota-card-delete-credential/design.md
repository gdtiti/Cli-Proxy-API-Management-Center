# Design Document

## Overview

为配额管理页面的所有凭证卡片添加删除功能。当前配额页面包含四种类型的配额区块：Antigravity、Codex、Gemini CLI 和 Kiro。每个区块显示对应类型的凭证文件及其配额使用情况。

本设计将在每个配额卡片上添加删除按钮，允许用户直接从配额页面删除凭证文件，无需切换到认证文件管理页面。

## Architecture

```
QuotaPage
├── QuotaSection (Antigravity)
│   └── QuotaCard[] ← 添加删除功能
├── QuotaSection (Codex)
│   └── QuotaCard[] ← 添加删除功能
├── QuotaSection (Gemini CLI)
│   └── QuotaCard[] ← 添加删除功能
└── KiroQuotaSection
    └── KiroCard[] ← 添加删除功能
```

删除流程：
1. 用户点击卡片上的删除按钮
2. 显示确认对话框
3. 用户确认后调用 `authFilesApi.deleteFile()`
4. 成功后更新文件列表和配额缓存
5. 显示通知消息

## Components and Interfaces

### QuotaCard 组件扩展

```typescript
// src/components/quota/QuotaCard.tsx

interface QuotaCardProps<TState extends QuotaStatusState> {
  item: AuthFileItem;
  quota?: TState;
  resolvedTheme: ResolvedTheme;
  i18nPrefix: string;
  cardClassName: string;
  defaultType: string;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
  // 新增删除相关 props
  onDelete?: (name: string) => void;
  isDeleting?: boolean;
  canDelete?: boolean;
}
```

### QuotaSection 组件扩展

```typescript
// src/components/quota/QuotaSection.tsx

interface QuotaSectionProps<TState extends QuotaStatusState, TData> {
  config: QuotaConfig<TState, TData>;
  files: AuthFileItem[];
  loading: boolean;
  disabled: boolean;
  // 新增删除回调
  onFileDeleted?: (name: string) => void;
}
```

### QuotaPage 删除处理

```typescript
// src/pages/QuotaPage.tsx

// 删除凭证处理函数
const handleDeleteFile = async (name: string) => {
  // 1. 显示确认对话框
  // 2. 调用 API 删除
  // 3. 更新本地状态
  // 4. 清除配额缓存
  // 5. 显示通知
};
```

### 工具函数

```typescript
// src/utils/quota/validators.ts

// 判断是否为运行时虚拟凭证（不可删除）
function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean;
```

## Data Models

### 删除状态

```typescript
interface DeleteState {
  deletingFile: string | null;  // 当前正在删除的文件名
}
```

### 通知消息

使用现有的 `useNotificationStore` 显示删除结果：
- 成功：`showNotification(t('quota.delete_success'), 'success')`
- 失败：`showNotification(t('quota.delete_failed', { message }), 'error')`

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Delete button visibility based on runtime-only status

*For any* AuthFileItem displayed in a QuotaCard, the delete button SHALL be visible if and only if the file is NOT a runtime-only credential (isRuntimeOnlyAuthFile returns false).

**Validates: Requirements 1.1, 1.2**

### Property 2: QuotaCard delete button rendering based on props

*For any* QuotaCard component instance, the delete button SHALL be rendered if and only if both `onDelete` callback is provided AND `canDelete` is true.

**Validates: Requirements 2.4**

## Error Handling

### API 错误处理

```typescript
try {
  await authFilesApi.deleteFile(name);
  // 成功处理
} catch (err: unknown) {
  const errorMessage = err instanceof Error ? err.message : t('common.unknown_error');
  showNotification(`${t('quota.delete_failed')}: ${errorMessage}`, 'error');
}
```

### 确认对话框

使用 `window.confirm()` 进行简单确认，与现有 AuthFilesPage 保持一致：

```typescript
if (!window.confirm(t('quota.delete_confirm', { name }))) return;
```

## Testing Strategy

### Unit Tests

1. **QuotaCard 组件测试**
   - 验证 `canDelete=true` 且 `onDelete` 存在时显示删除按钮
   - 验证 `canDelete=false` 时不显示删除按钮
   - 验证 `isDeleting=true` 时按钮显示加载状态

2. **isRuntimeOnlyAuthFile 函数测试**
   - 验证 `runtime_only: true` 返回 true
   - 验证 `runtimeOnly: true` 返回 true
   - 验证无该字段返回 false

### Property-Based Tests

由于此功能主要涉及 UI 交互和 API 调用，属性测试的价值有限。核心逻辑（isRuntimeOnlyAuthFile）已在现有代码中经过验证。

### Integration Tests

1. 验证删除流程完整性：点击 → 确认 → API 调用 → 状态更新 → 通知
2. 验证删除后配额缓存被正确清除
