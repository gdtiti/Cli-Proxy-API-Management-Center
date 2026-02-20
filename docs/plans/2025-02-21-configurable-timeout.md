# 可配置超时参数实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为认证文件列表API实现可配置的超时参数，解决大量认证文件加载超时问题。

**Architecture:** 通过在 Config 类型中添加 apiTimeout 和 authFilesTimeout 字段，在可视化配置界面提供超时设置，并在 authFilesApi.list() 方法中使用配置的超时值。

**Tech Stack:** TypeScript, React, Zustand, Axios

---

## 前置检查

在开始实施之前，请确认以下文件存在并了解其结构：

1. `src/types/config.ts` - Config 类型定义
2. `src/types/visualConfig.ts` - VisualConfigValues 类型定义
3. `src/services/api/authFiles.ts` - 认证文件API
4. `src/services/api/client.ts` - API客户端
5. `src/components/config/VisualConfigEditor.tsx` - 可视化配置编辑器
6. `src/hooks/useVisualConfig.ts` - 可视化配置Hook

---

## Task 1: 扩展 Config 类型添加超时字段

**Files:**

- Modify: `src/types/config.ts`

**Step 1: 添加超时配置字段到 Config 接口**

在 Config 接口中添加以下可选字段（在现有字段之后）：

```typescript
export interface Config {
  // ... 现有字段 ...

  // 新增：API超时配置（毫秒）
  apiTimeout?: number;

  // 新增：认证文件列表专用超时（毫秒）
  authFilesTimeout?: number;

  // ... 其他字段 ...
}
```

**Step 2: 验证类型定义**

运行 TypeScript 类型检查：

```bash
npm run type-check
```

Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/types/config.ts
git commit -m "feat(config): add apiTimeout and authFilesTimeout fields to Config type"
```

---

## Task 2: 扩展 VisualConfigValues 类型

**Files:**

- Modify: `src/types/visualConfig.ts`

**Step 1: 添加超时字段到 VisualConfigValues 类型**

在 VisualConfigValues 类型中添加：

```typescript
export type VisualConfigValues = {
  // ... 现有字段 ...

  // 新增超时配置（字符串类型用于输入框）
  apiTimeout: string; // 通用API超时（秒）
  authFilesTimeout: string; // 认证文件列表专用超时（秒）

  // ... 其他字段 ...
};
```

**Step 2: 更新 DEFAULT_VISUAL_VALUES 添加默认值**

```typescript
export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  // ... 现有默认值 ...

  // 默认值：30秒通用，60秒认证文件列表
  apiTimeout: '30',
  authFilesTimeout: '60',

  // ... 其他默认值 ...
};
```

**Step 3: 验证类型定义**

运行：

```bash
npm run type-check
```

Expected: 无类型错误

**Step 4: 提交**

```bash
git add src/types/visualConfig.ts
git commit -m "feat(config): add timeout fields to VisualConfigValues with defaults"
```

---

## Task 3: 在 useVisualConfig 中添加超时配置解析

**Files:**

- Modify: `src/hooks/useVisualConfig.ts`

**Step 1: 在 parseVisualConfigValues 中解析超时配置**

在 `parseVisualConfigValues` 函数中添加超时字段解析（在返回对象中）：

```typescript
export const parseVisualConfigValues = (config: Config): Partial<VisualConfigValues> => {
  return {
    // ... 现有字段解析 ...

    // 解析超时配置（将毫秒转换为秒显示）
    apiTimeout: String((config.apiTimeout || 30000) / 1000), // 默认30秒
    authFilesTimeout: String((config.authFilesTimeout || 60000) / 1000), // 默认60秒

    // ... 其他字段 ...
  };
};
```

**Step 2: 在 applyVisualChangesToYaml 中保存超时配置**

在 `applyVisualChangesToYaml` 函数中添加超时配置保存逻辑（在设置其他字段后）：

```typescript
export const applyVisualChangesToYaml = (
  currentYaml: string,
  values: VisualConfigValues
): string => {
  const doc = parseDocument(currentYaml);

  // ... 现有字段处理 ...

  // 保存超时配置（将秒转换为毫秒）
  if (values.apiTimeout) {
    const timeoutMs = parseInt(values.apiTimeout, 10) * 1000;
    if (!isNaN(timeoutMs) && timeoutMs > 0) {
      doc.setIn(['api-timeout'], timeoutMs);
    }
  }

  if (values.authFilesTimeout) {
    const timeoutMs = parseInt(values.authFilesTimeout, 10) * 1000;
    if (!isNaN(timeoutMs) && timeoutMs > 0) {
      doc.setIn(['auth-files-timeout'], timeoutMs);
    }
  }

  return String(doc);
};
```

**Step 3: 验证实现**

运行类型检查：

```bash
npm run type-check
```

**Step 4: 提交**

```bash
git add src/hooks/useVisualConfig.ts
git commit -m "feat(config): parse and save timeout settings in visual config"
```

---

## Task 4: 在 VisualConfigEditor 中添加超时设置UI

**Files:**

- Modify: `src/components/config/VisualConfigEditor.tsx`

**Step 1: 在网络配置部分后添加超时配置部分**

在 `VisualConfigEditor.tsx` 中找到网络配置部分（`routing` 相关代码之后），添加新的配置部分：

```tsx
{
  /* 在路由策略配置之后添加 */
}
<ConfigSection
  title={t('config_management.visual.sections.timeouts.title')}
  description={t('config_management.visual.sections.timeouts.description')}
>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <Input
      label={t('config_management.visual.sections.timeouts.api_timeout')}
      type="number"
      placeholder="30"
      min="1"
      max="300"
      value={values.apiTimeout}
      onChange={(e) => onChange({ apiTimeout: e.target.value })}
      disabled={disabled}
      suffix={t('config_management.visual.sections.timeouts.seconds')}
    />
    <Input
      label={t('config_management.visual.sections.timeouts.auth_files_timeout')}
      description={t('config_management.visual.sections.timeouts.auth_files_timeout_desc')}
      type="number"
      placeholder="60"
      min="1"
      max="600"
      value={values.authFilesTimeout}
      onChange={(e) => onChange({ authFilesTimeout: e.target.value })}
      disabled={disabled}
      suffix={t('config_management.visual.sections.timeouts.seconds')}
    />
  </div>
</ConfigSection>;
```

**Step 2: 添加 i18n 翻译**

在 `src/i18n/locales/zh-CN.json` 中添加：

```json
{
  "config_management": {
    "visual": {
      "sections": {
        "timeouts": {
          "title": "超时配置",
          "description": "配置API请求的超时时间",
          "api_timeout": "通用API超时",
          "auth_files_timeout": "认证文件列表超时",
          "auth_files_timeout_desc": "加载大量认证文件时需要更长的超时时间",
          "seconds": "秒"
        }
      }
    }
  }
}
```

在 `src/i18n/locales/en.json` 中添加：

```json
{
  "config_management": {
    "visual": {
      "sections": {
        "timeouts": {
          "title": "Timeout Configuration",
          "description": "Configure API request timeout settings",
          "api_timeout": "General API Timeout",
          "auth_files_timeout": "Auth Files List Timeout",
          "auth_files_timeout_desc": "Longer timeout needed when loading large numbers of auth files",
          "seconds": "seconds"
        }
      }
    }
  }
}
```

**Step 3: 验证实现**

运行类型检查：

```bash
npm run type-check
```

**Step 4: 提交**

```bash
git add src/components/config/VisualConfigEditor.tsx src/i18n/locales/
git commit -m "feat(config): add timeout configuration UI to visual config editor"
```

---

## Task 5: 更新认证文件API使用可配置超时

**Files:**

- Modify: `src/services/api/authFiles.ts`

**Step 1: 修改 list 方法使用可配置超时**

在 `authFiles.ts` 中修改 `list` 方法，使其使用从配置中读取的超时值：

```typescript
import { REQUEST_TIMEOUT_MS } from '@/utils/constants';

// 从 localStorage 或默认值获取超时配置
const getAuthFilesTimeout = (): number => {
  // 尝试从 localStorage 读取用户自定义配置
  const storedTimeout = localStorage.getItem('authFilesTimeout');
  if (storedTimeout) {
    const parsed = parseInt(storedTimeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed * 1000; // 转换为毫秒
    }
  }

  // 默认60秒（比通用超时更长，适合大量认证文件加载）
  return 60000;
};

export const authFilesApi = {
  // 使用自定义超时的列表方法
  list: () =>
    apiClient.get<AuthFilesResponse>('/auth-files', {
      timeout: getAuthFilesTimeout(),
    }),

  // 其他方法保持不变...
  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  // ... 其他方法
};
```

**Step 2: 添加全局配置同步机制（可选增强）**

为了使超时配置可以从可视化配置界面实时同步，添加配置监听：

```typescript
// 在 authFiles.ts 中添加配置同步
let authFilesTimeoutMs = 60000; // 默认60秒

// 监听配置变化
export const updateAuthFilesTimeout = (timeoutSeconds: number): void => {
  authFilesTimeoutMs = timeoutSeconds * 1000;
  // 同时保存到 localStorage 以便持久化
  localStorage.setItem('authFilesTimeout', String(timeoutSeconds));
};

// 导出当前超时值供其他模块使用
export const getCurrentAuthFilesTimeout = (): number => authFilesTimeoutMs;
```

**Step 3: 验证实现**

运行类型检查：

```bash
npm run type-check
```

**Step 4: 提交**

```bash
git add src/services/api/authFiles.ts
git commit -m "feat(auth-files): use configurable timeout for auth files list API"
```

---

## Task 6: 添加配置同步机制

**Files:**

- Modify: `src/hooks/useVisualConfig.ts`

**Step 1: 在配置保存时同步超时设置**

在 `useVisualConfig.ts` 的 `applyVisualChangesToYaml` 函数中，添加配置同步逻辑：

```typescript
import { updateAuthFilesTimeout } from '@/services/api/authFiles';

// 在 applyVisualChangesToYaml 函数中，保存配置后同步超时设置
export const useVisualConfig = () => {
  // ... 现有代码 ...

  const saveConfig = useCallback(
    async (yamlContent: string) => {
      try {
        await configFileApi.saveConfigYaml(yamlContent);

        // 同步超时配置到 authFilesApi
        const timeoutSeconds = parseInt(values.authFilesTimeout, 10);
        if (!isNaN(timeoutSeconds) && timeoutSeconds > 0) {
          updateAuthFilesTimeout(timeoutSeconds);
        }

        // ... 其他保存逻辑 ...
      } catch (error) {
        // ... 错误处理 ...
      }
    },
    [values.authFilesTimeout /* 其他依赖 */]
  );

  // ... 其他代码 ...
};
```

**Step 2: 在配置加载时恢复超时设置**

在 `parseVisualConfigValues` 函数中，添加从配置恢复超时设置的逻辑：

```typescript
export const parseVisualConfigValues = (config: Config): Partial<VisualConfigValues> => {
  // 从配置中恢复超时设置
  const authFilesTimeoutSeconds = config.authFilesTimeout
    ? Math.round(config.authFilesTimeout / 1000)
    : 60; // 默认60秒

  // 同时同步到 authFilesApi
  if (typeof window !== 'undefined') {
    updateAuthFilesTimeout(authFilesTimeoutSeconds);
  }

  return {
    // ... 其他字段 ...

    authFilesTimeout: String(authFilesTimeoutSeconds),

    // ... 其他字段 ...
  };
};
```

**Step 3: 验证实现**

运行类型检查：

```bash
npm run type-check
```

**Step 4: 提交**

```bash
git add src/hooks/useVisualConfig.ts
git commit -m "feat(config): sync timeout settings between visual config and authFilesApi"
```

---

## Task 7: 集成测试

**Files:**

- Modify: `src/App.tsx` 或适当的测试文件

**Step 1: 创建简单的超时配置测试**

在应用启动时验证超时配置是否正确加载：

```typescript
// 在 App.tsx 或初始化代码中添加
import { getCurrentAuthFilesTimeout } from '@/services/api/authFiles';

// 在应用初始化时
useEffect(() => {
  // 验证超时配置
  const currentTimeout = getCurrentAuthFilesTimeout();
  console.log('[AuthFiles] Current timeout:', currentTimeout, 'ms');

  // 验证 localStorage 中的配置
  const storedTimeout = localStorage.getItem('authFilesTimeout');
  console.log('[AuthFiles] Stored timeout:', storedTimeout, 'seconds');
}, []);
```

**Step 2: 手动测试验证**

1. 启动应用
2. 进入配置页面
3. 修改"认证文件列表超时"值为120秒
4. 保存配置
5. 刷新页面，验证值是否持久化
6. 打开浏览器控制台，验证日志输出的超时值是否正确

**Step 3: 提交测试代码**

```bash
git add src/App.tsx
git commit -m "test: add timeout configuration validation on app startup"
```

---

## 实施完成后的验证清单

实施完成后，请验证以下功能是否正常工作：

- [ ] Config 类型包含 apiTimeout 和 authFilesTimeout 字段
- [ ] VisualConfigValues 类型包含超时字段
- [ ] 可视化配置编辑器显示超时配置部分
- [ ] 超时值可以正确保存到后端配置
- [ ] 超时值在页面刷新后正确恢复
- [ ] authFilesApi.list() 使用配置的超时值
- [ ] 大量认证文件加载时不再超时

---

## 相关文档

- `docs/plans/YYYY-MM-DD-configurable-timeout.md` - 本计划文档
- `src/types/config.ts` - Config 类型定义
- `src/types/visualConfig.ts` - VisualConfigValues 类型定义
- `src/services/api/authFiles.ts` - 认证文件API
- `src/components/config/VisualConfigEditor.tsx` - 可视化配置编辑器

---

**计划制定完成。** 实施此计划后，认证文件列表API将支持可配置的超时参数，解决大量认证文件加载超时问题。
