# 需求文档

## 简介

为 Cli-Proxy-API-Management-Center 前端项目实现 Codex 凭证按套餐类型（Plus/Free/Team/通用）分 Tab 显示、每个 Tab 独立计算额度、以及在编辑页面支持设置 planType 和不同可用模型配置的功能。当前所有 Codex 凭证混合在一个 QuotaSection 中显示，无法区分不同套餐类型的凭证和额度。

## 术语表

- **QuotaPage**：额度管理页面，展示各 AI 提供商的凭证额度信息
- **QuotaSection**：额度区域组件，负责展示某一类提供商的凭证卡片和额度
- **CodexTab**：Codex 区域内按套餐类型划分的标签页
- **PlanType**：套餐类型，取值为 plus、free、team 或空字符串（通用）
- **ProviderKeyConfig**：前端凭证配置数据类型，包含 apiKey、baseUrl、models 等字段
- **CodexEditPage**：Codex 凭证编辑页面，用于新增或修改 Codex 凭证配置

## 需求

### 需求 1：获取套餐类型列表

**用户故事：** 作为管理员，我希望系统能获取所有可用的 Codex 套餐类型，以便在界面上动态生成对应的 Tab。

#### 验收标准

1. WHEN QuotaPage 加载时，THE CodexTab 组件 SHALL 调用后端 API `GET /codex-api-key/plan-types` 获取套餐类型及数量
2. IF 后端 API 返回错误，THEN THE CodexTab 组件 SHALL 回退为单一列表显示所有 Codex 凭证
3. WHEN 套餐类型数据返回时，THE CodexTab 组件 SHALL 为每个存在凭证的套餐类型生成一个 Tab

### 需求 2：分 Tab 显示 Codex 凭证

**用户故事：** 作为管理员，我希望 Codex 凭证按套餐类型分 Tab 显示，以便快速查看特定套餐的凭证状态。

#### 验收标准

1. WHEN Codex 区域渲染时，THE CodexTab 组件 SHALL 显示 Tab 栏，每个 Tab 对应一个套餐类型（Plus、Free、Team、通用）
2. WHEN 用户点击某个 Tab 时，THE CodexTab 组件 SHALL 仅显示该套餐类型对应的凭证卡片
3. WHEN 某个套餐类型没有凭证时，THE CodexTab 组件 SHALL 隐藏该套餐类型的 Tab
4. THE CodexTab 组件 SHALL 在每个 Tab 标签上显示该套餐类型的凭证数量
5. WHEN 页面首次加载时，THE CodexTab 组件 SHALL 默认选中第一个有凭证的 Tab

### 需求 3：分块额度计算

**用户故事：** 作为管理员，我希望每个套餐 Tab 下独立显示该套餐的额度使用情况，以便准确了解各套餐的资源消耗。

#### 验收标准

1. WHEN 用户切换到某个 Tab 时，THE CodexTab 组件 SHALL 仅加载和显示该 Tab 下凭证的额度数据
2. WHEN 额度数据加载中时，THE QuotaCard 组件 SHALL 显示加载状态
3. WHEN 额度数据加载完成时，THE QuotaCard 组件 SHALL 显示该凭证的套餐类型标签和额度窗口信息
4. WHEN 用户刷新额度时，THE CodexTab 组件 SHALL 仅刷新当前活动 Tab 下的凭证额度

### 需求 4：凭证编辑页面支持 PlanType 设置

**用户故事：** 作为管理员，我希望在编辑 Codex 凭证时能设置套餐类型，以便系统正确分类和管理凭证。

#### 验收标准

1. THE CodexEditPage SHALL 在表单中提供 PlanType 下拉选择器，选项包括 Plus、Free、Team 和通用
2. WHEN 编辑已有凭证时，THE CodexEditPage SHALL 回显该凭证当前的 PlanType 值
3. WHEN 保存凭证时，THE CodexEditPage SHALL 将 PlanType 字段包含在提交的 payload 中
4. WHEN PlanType 未选择时，THE CodexEditPage SHALL 默认使用空字符串表示通用类型

### 需求 5：ProviderKeyConfig 类型扩展

**用户故事：** 作为开发者，我希望前端数据类型支持 planType 字段，以便在整个数据流中正确传递套餐类型信息。

#### 验收标准

1. THE ProviderKeyConfig 类型 SHALL 包含可选的 planType 字段，类型为 string
2. WHEN 从后端 API 反序列化凭证数据时，THE normalizeProviderKeyConfig 函数 SHALL 解析 `plan-type` 或 `planType` 字段
3. WHEN 向后端 API 序列化凭证数据时，THE serializeProviderKey 函数 SHALL 将 planType 序列化为 `plan-type` 字段

### 需求 6：按套餐类型过滤凭证

**用户故事：** 作为管理员，我希望系统能根据套餐类型过滤凭证列表，以便在不同 Tab 下显示正确的凭证。

#### 验收标准

1. WHEN 过滤凭证时，THE 过滤逻辑 SHALL 根据凭证的 planType 字段匹配当前 Tab 的套餐类型
2. WHEN 凭证的 planType 为空或未定义时，THE 过滤逻辑 SHALL 将该凭证归类到"通用"Tab
3. WHEN 凭证的 planType 值不在预定义列表中时，THE 过滤逻辑 SHALL 将该凭证归类到"通用"Tab
