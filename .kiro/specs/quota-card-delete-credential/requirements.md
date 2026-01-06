# Requirements Document

## Introduction

为配额查询页面的所有凭证卡片（Antigravity、Codex、Gemini CLI、Kiro）添加删除凭证功能，使用户可以直接在配额页面管理凭证文件，而无需切换到认证文件页面。

## Glossary

- **Quota_Card**: 配额查询卡片，显示单个凭证文件的配额使用情况
- **Quota_Section**: 配额区块组件，包含多个 Quota_Card 的容器
- **Auth_File**: 认证凭证文件，存储 API 访问凭证的 JSON 文件
- **Runtime_Only_File**: 运行时虚拟凭证文件，不可删除
- **Delete_Confirmation**: 删除确认对话框

## Requirements

### Requirement 1: 配额卡片删除按钮

**User Story:** As a user, I want to delete credential files directly from quota cards, so that I can manage credentials without switching to the Auth Files page.

#### Acceptance Criteria

1. WHEN a quota card is displayed for a non-runtime-only credential, THE Quota_Card SHALL display a delete button in the card header
2. WHEN a quota card is displayed for a runtime-only credential, THE Quota_Card SHALL NOT display a delete button
3. WHEN the delete button is clicked, THE System SHALL display a Delete_Confirmation dialog with the credential file name
4. WHEN the user confirms deletion, THE System SHALL call the auth files delete API and remove the credential
5. WHEN deletion succeeds, THE System SHALL remove the card from the current view and show a success notification
6. WHEN deletion fails, THE System SHALL display an error notification with the failure reason
7. WHILE a deletion is in progress, THE delete button SHALL display a loading state and be disabled

### Requirement 2: 通用配额卡片组件支持

**User Story:** As a developer, I want the QuotaCard component to support delete functionality, so that all quota sections can use it consistently.

#### Acceptance Criteria

1. THE QuotaCard component SHALL accept an optional onDelete callback prop
2. THE QuotaCard component SHALL accept an optional isDeleting boolean prop for loading state
3. THE QuotaCard component SHALL accept an optional canDelete boolean prop to control button visibility
4. WHEN onDelete is provided and canDelete is true, THE QuotaCard SHALL render the delete button
5. WHEN isDeleting is true, THE delete button SHALL show a loading spinner and be disabled

### Requirement 3: 配额区块删除处理

**User Story:** As a user, I want deleted credentials to be immediately reflected in the quota section, so that I have accurate feedback.

#### Acceptance Criteria

1. WHEN a credential is deleted from a Quota_Section, THE System SHALL update the file list state
2. WHEN a credential is deleted, THE System SHALL clear the quota cache for that credential
3. WHEN a credential is deleted, THE System SHALL trigger a refresh of the parent page's file list
4. THE QuotaSection component SHALL pass delete handlers to each QuotaCard

### Requirement 4: Kiro 配额区块删除支持

**User Story:** As a user, I want to delete Kiro credentials from the Kiro quota section, so that I can manage Kiro credentials consistently with other providers.

#### Acceptance Criteria

1. THE KiroQuotaSection SHALL implement delete functionality for Kiro credential cards
2. WHEN a Kiro credential is deleted, THE KiroQuotaSection SHALL update its local state and quota cache
3. THE KiroQuotaSection SHALL follow the same delete confirmation and notification patterns as other sections

### Requirement 5: 国际化支持

**User Story:** As a user, I want delete-related messages to be displayed in my preferred language, so that I can understand the actions being performed.

#### Acceptance Criteria

1. THE delete confirmation message SHALL be translatable via i18n
2. THE success notification message SHALL be translatable via i18n
3. THE error notification message SHALL be translatable via i18n
4. THE delete button tooltip SHALL be translatable via i18n
