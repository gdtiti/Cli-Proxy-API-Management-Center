# Implementation Plan: Quota Card Delete Credential

## Overview

为配额管理页面的所有凭证卡片（Antigravity、Codex、Gemini CLI、Kiro）添加删除凭证功能。

## Tasks

- [x] 1. 添加国际化翻译键
  - 在 `src/i18n/locales/zh-CN.json` 和 `src/i18n/locales/en.json` 中添加删除相关翻译
  - 添加 `quota_management.delete_confirm`、`quota_management.delete_success`、`quota_management.delete_failed`、`quota_management.delete_button` 键
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. 扩展 QuotaCard 组件支持删除功能
  - [x] 2.1 添加删除相关 props 到 QuotaCard 接口
    - 添加 `onDelete?: (name: string) => void` 回调
    - 添加 `isDeleting?: boolean` 加载状态
    - 添加 `canDelete?: boolean` 控制按钮可见性
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 在 QuotaCard 中渲染删除按钮
    - 当 `canDelete` 为 true 且 `onDelete` 存在时显示删除按钮
    - 使用 `IconTrash2` 图标
    - 按钮放置在卡片头部右侧
    - _Requirements: 1.1, 2.4_
  - [x] 2.3 实现删除按钮加载状态
    - 当 `isDeleting` 为 true 时显示 LoadingSpinner
    - 禁用按钮防止重复点击
    - _Requirements: 1.7, 2.5_

- [x] 3. 扩展 QuotaSection 组件处理删除
  - [x] 3.1 添加删除回调 prop 到 QuotaSection
    - 添加 `onFileDeleted?: (name: string) => void` 回调
    - _Requirements: 3.4_
  - [x] 3.2 实现删除状态管理
    - 添加 `deletingFile` 状态跟踪当前删除的文件
    - _Requirements: 1.7_
  - [x] 3.3 实现删除处理函数
    - 显示确认对话框
    - 调用 `authFilesApi.deleteFile()`
    - 成功后调用 `onFileDeleted` 回调
    - 清除该凭证的配额缓存
    - 显示成功/失败通知
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 3.2_
  - [x] 3.4 传递删除 props 到 QuotaCard
    - 使用 `isRuntimeOnlyAuthFile` 判断 `canDelete`
    - 传递 `onDelete`、`isDeleting`、`canDelete`
    - _Requirements: 1.2, 3.4_

- [x] 4. 更新 QuotaPage 处理文件删除
  - [x] 4.1 实现文件删除后的状态更新
    - 从 `files` 状态中移除已删除的文件
    - _Requirements: 3.1_
  - [x] 4.2 传递 onFileDeleted 回调到各 QuotaSection
    - 传递给 Antigravity、Codex、Gemini CLI 三个 QuotaSection
    - _Requirements: 3.3_

- [x] 5. 为 KiroQuotaSection 添加删除功能
  - [x] 5.1 添加删除状态管理
    - 添加 `deletingFile` 状态
    - _Requirements: 4.1_
  - [x] 5.2 实现删除处理函数
    - 显示确认对话框
    - 调用 `authFilesApi.deleteFile()`
    - 更新本地 `kiroFiles` 状态
    - 清除该凭证的 Kiro 配额缓存
    - 显示成功/失败通知
    - _Requirements: 4.2, 4.3_
  - [x] 5.3 在 Kiro 卡片中渲染删除按钮
    - 使用与 QuotaCard 相同的样式
    - 对非运行时凭证显示删除按钮
    - _Requirements: 4.1_

- [x] 6. Checkpoint - 验证功能完整性
  - 确保所有配额卡片（Antigravity、Codex、Gemini CLI、Kiro）都有删除按钮
  - 确保运行时虚拟凭证不显示删除按钮
  - 确保删除流程正常工作
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 删除功能复用现有的 `authFilesApi.deleteFile()` API
- 使用 `isRuntimeOnlyAuthFile()` 判断凭证是否可删除
- 删除确认使用 `window.confirm()` 与 AuthFilesPage 保持一致
- 删除后需要同时更新文件列表和配额缓存
