# 实现任务清单：cached-api-clients

## 1. 基础架构

- [x] 1.1 创建 `src/stores/useClientCacheStore.ts` 独立 store 文件
- [x] 1.2 实现 useClientCacheStore 基本结构（使用 zustand persist）
- [x] 1.3 定义 ClientConfig 接口类型（id, name, apiBase, managementKey, createdAt, lastConnectedAt）
- [x] 1.4 集成 secureStorage 加密存储管理密钥

## 2. 客户端配置 CRUD

- [x] 2.1 实现 addClient 配置方法（验证必填字段，生成唯一 ID）
- [x] 2.2 实现 updateClient 配置更新方法
- [x] 2.3 实现 deleteClient 配置删除方法
- [x] 2.4 实现 getClients 获取所有配置方法
- [x] 2.5 实现 getClientById 获取单个配置方法

## 3. 客户端选择与切换

- [x] 3.1 添加 activeClientId 状态字段
- [x] 3.2 实现 setActiveClient 切换活动客户端方法
- [x] 3.3 实现 clearActiveClient 清除活动客户端方法

## 4. 登录页集成

- [x] 4.1 在 LoginPage.tsx 导入 useClientCacheStore
- [x] 4.2 创建客户端选择下拉组件 ClientSelector
- [x] 4.3 实现选中客户端自动填充表单逻辑
- [x] 4.4 在连接成功时更新 lastConnectedAt 时间戳

## 5. 快捷键支持

- [x] 5.1 创建 useClientKeyboardShortcuts 自定义 Hook
- [x] 5.2 实现 Ctrl+1~9 全局快捷键绑定
- [x] 5.3 添加快捷键开关配置项
- [x] 5.4 防止快捷键与浏览器默认行为冲突

## 6. 客户端管理界面

- [x] 6.1 创建 ClientManagementModal 客户端管理弹窗
- [x] 6.2 实现客户端列表展示（隐藏密钥）
- [x] 6.3 实现添加新客户端表单
- [x] 6.4 实现编辑现有客户端功能
- [x] 6.5 实现删除客户端确认对话框

## 7. 类型与导出

- [x] 7.1 在 stores/index.ts 导出 useClientCacheStore
- [x] 7.2 添加 TypeScript 类型定义
- [x] 7.3 验证与现有 useAuthStore 的兼容性
