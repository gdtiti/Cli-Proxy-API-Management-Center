# 发布管理界面（management.html）

## 目标

明确本仓库管理界面的标准发布方式，避免把“本地构建产物”和“GitHub Release 资产”混为一谈。

## 关键事实

- 本地构建输出是单文件 `dist/index.html`
- 发布到 GitHub Release 的资产名是 `management.html`
- `management.html` 不是仓库里直接维护的文件，而是 GitHub Actions 在发布流程中由 `index.html` 重命名得到
- UI 版本号在构建期注入，优先级是：`VERSION` 环境变量 → git tag → `package.json`

代码锚点：`package.json:8`、`vite.config.ts:11`、`vite.config.ts:48`、`vite.config.ts:67`、`.github/workflows/release.yml:3`、`.github/workflows/release.yml:31`、`.github/workflows/release.yml:36`、`.github/workflows/release.yml:56`、`README_CN.md:118`

## 发布前检查

1. 确认本次改动已经整理完毕，需要发布的提交已在本地分支上
2. 执行类型检查：`pnpm type-check`
3. 执行本地测试：`pnpm test`
4. 选择要发布的版本号，例如 `v1.2.19`
5. 确认目标远端存在并可推送，例如 `gdtiti`

## 标准发布步骤

### 1. 本地构建正式版本

PowerShell：

```powershell
$env:VERSION='vX.Y.Z'
pnpm run build
```

说明：

- 这里显式传入 `VERSION`，用于让页脚和构建内嵌版本与即将发布的 tag 保持一致
- 构建成功后应检查 `dist/index.html` 是否生成

### 2. 核对本地产物

至少确认以下事实：

- 产物路径是 `dist/index.html`
- 本地不会直接产出 `dist/management.html`
- 如果需要抽查内容，可以用浏览器打开 `dist/index.html` 或配合 `pnpm preview`

### 3. 创建并推送版本标签

```powershell
git tag vX.Y.Z
git push gdtiti vX.Y.Z
```

说明：

- 发布工作流由 tag 触发，不依赖手工上传 `management.html`
- tag 规则是 `v*`

### 4. 等待 GitHub Actions 完成 Release

工作流执行时会完成以下动作：

1. 安装依赖
2. 使用 `VERSION=${{ github.ref_name }}` 执行构建
3. 进入 `dist/`，把 `index.html` 重命名为 `management.html`
4. 生成 release notes
5. 创建 GitHub Release，并上传 `dist/management.html`

### 5. 发布后验收

到 GitHub 仓库确认：

- 对应 tag 的 Actions 任务为成功状态
- Release 已创建
- Release 资产名是 `management.html`
- 下载后的页面版本与本次 tag 一致

## 常见问题

### 为什么本地只有 `dist/index.html`，没有 `management.html`？

因为重命名动作发生在 `.github/workflows/release.yml` 的发布流程里，不在本地 `pnpm run build` 阶段完成。

### `spawn EPERM` 是什么问题？

这通常是受限执行环境下的进程拉起权限问题，不一定表示前端代码构建失败。应先区分“环境限制”与“代码编译错误”。

### 没有登录 `gh` CLI，会影响发布吗？

不会。当前仓库的标准发布路径是“推送 `v*` tag 触发 GitHub Actions”，不是本地手工调用 `gh release create`。

### 为什么要显式设置 `VERSION`？

因为本地构建如果不传 `VERSION`，会退回到 git tag 或 `package.json` 版本。正式发版前显式传入版本号更稳定，也更容易复核页面页脚版本。

## 已验证案例

- 已按 `v1.2.18` 执行过一次完整发布验证
- 本地构建命令：`$env:VERSION='v1.2.18'; pnpm run build`
- 该次验证再次确认：本地产物是 `dist/index.html`，Release 资产才是 `management.html`

## 相关文档

- `llmdoc/index.md`
- `llmdoc/reference/scripts-and-dependencies.md`
- `README_CN.md`
- `.github/workflows/release.yml`
