# Development Utility Scripts

快速开发工具脚本，提供编译、测试、启动、停止和各种便捷登录快捷方式。

## 使用方法

### Windows

```bash
# 显示帮助
dev.bat help

# 安装依赖
dev.bat install

# 启动开发服务器
dev.bat dev

# 构建生产版本
dev.bat build
```

### Linux/macOS

```bash
# 添加执行权限（首次使用）
chmod +x dev.sh

# 显示帮助
./dev.sh help

# 安装依赖
./dev.sh install

# 启动开发服务器
./dev.sh dev

# 构建生产版本
./dev.sh build
```

## 命令列表

### 开发命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `install` | `i` | 安装依赖包 |
| `dev` | `d` | 启动开发服务器 |
| `build` | `b` | 构建生产版本 |
| `preview` | `p` | 预览生产构建 |
| `test` | `t` | 运行测试 |
| `lint` | `l` | 运行代码检查 |
| `format` | `fmt` | 格式化代码 |
| `clean` | `c` | 清理构建产物 |

### 后端命令

| 命令 | 说明 |
|------|------|
| `start` | 启动 CLIProxyAPIPlus 后端 |
| `stop` | 停止 CLIProxyAPIPlus 后端 |
| `restart` | 重启 CLIProxyAPIPlus 后端 |
| `status` | 检查后端运行状态 |

### 认证命令

| 命令 | 说明 |
|------|------|
| `login` | 显示登录菜单 |
| `login-kiro` | 登录 Kiro (AWS CodeWhisperer) |
| `login-codex` | 登录 Codex (ChatGPT) |
| `login-gemini` | 登录 Gemini CLI |
| `login-antigravity` | 登录 Antigravity |

### 配额命令

| 命令 | 别名 | 说明 |
|------|------|------|
| `quota` | `q` | 检查所有提供商的配额 |

## 使用示例

### 完整开发流程

```bash
# 1. 安装依赖
dev.bat install

# 2. 启动后端
dev.bat start

# 3. 启动前端开发服务器
dev.bat dev

# 4. 在另一个终端检查后端状态
dev.bat status
```

### 登录认证

```bash
# 交互式登录菜单
dev.bat login

# 或直接登录特定提供商
dev.bat login-kiro
dev.bat login-codex
dev.bat login-gemini
```

### Kiro 登录选项

Kiro 支持三种认证方式：

1. **AWS Builder ID (SSO)** - 推荐用于个人开发者
2. **Google OAuth** - 使用 Google 账号登录
3. **GitHub OAuth** - 使用 GitHub 账号登录

```bash
# 启动 Kiro 登录，然后选择认证方式
dev.bat login-kiro
```

### 检查配额

```bash
# 检查所有提供商的配额
dev.bat quota

# 输出示例：
# === Kiro Quota ===
# Account: kiro-builder-id.json
# Total: 1500/2000 (75% remaining)
# Base: 500/1000
# Free Trial: 1000/1000
#
# === Codex Quota ===
# Account: codex-chatgpt.json
# Plan: Plus
# Primary Window: 80% remaining
```

### 构建和预览

```bash
# 构建生产版本
dev.bat build

# 预览构建结果
dev.bat preview
```

### 代码质量

```bash
# 运行代码检查
dev.bat lint

# 格式化代码
dev.bat format

# 运行测试
dev.bat test
```

### 清理和重启

```bash
# 清理构建产物
dev.bat clean

# 重新安装依赖
dev.bat install

# 重启后端
dev.bat restart
```

## 配置要求

### 前端开发

- Node.js >= 18.0.0
- npm >= 9.0.0

### 后端运行

- CLIProxyAPIPlus 可执行文件位于 `../CLIProxyAPIPlus/` 目录
- 或者 CLIProxyAPIPlus 已添加到系统 PATH

### 认证工具

- `cliproxyapi` CLI 工具已安装并添加到系统 PATH
- 用于执行登录和配额查询命令

## 故障排除

### Windows 脚本无法运行

如果遇到 "无法识别的命令" 错误：

```bash
# 确保在正确的目录
cd D:\_Works\_GitBoard\_ai_toapi\_CLIProxyAPI\Cli-Proxy-API-Management-Center

# 使用完整路径运行
D:\_Works\_GitBoard\_ai_toapi\_CLIProxyAPI\Cli-Proxy-API-Management-Center\dev.bat help
```

### Linux/macOS 权限问题

```bash
# 添加执行权限
chmod +x dev.sh

# 如果仍然无法执行，使用 bash 显式运行
bash dev.sh help
```

### 后端无法启动

1. 检查后端可执行文件是否存在：
   ```bash
   dev.bat status
   ```

2. 手动指定后端路径（修改脚本中的 `BACKEND_DIR` 变量）

3. 检查端口是否被占用（默认端口通常是 8080）

### 登录命令失败

1. 确保 `cliproxyapi` CLI 工具已安装：
   ```bash
   cliproxyapi --version
   ```

2. 如果未安装，从 CLIProxyAPIPlus 发布页面下载

3. 将 `cliproxyapi` 添加到系统 PATH

## 高级用法

### 自定义后端路径

编辑脚本文件，修改 `BACKEND_DIR` 变量：

**Windows (dev.bat):**
```batch
set "BACKEND_DIR=C:\path\to\your\CLIProxyAPIPlus"
```

**Linux/macOS (dev.sh):**
```bash
BACKEND_DIR="/path/to/your/CLIProxyAPIPlus"
```

### 添加自定义命令

可以在脚本中添加自定义命令。例如，添加一个部署命令：

**Windows (dev.bat):**
```batch
if /i "%CMD%"=="deploy" goto :deploy

:deploy
echo %COLOR_GREEN%Deploying application...%COLOR_RESET%
call npm run build
:: 添加你的部署逻辑
goto :eof
```

**Linux/macOS (dev.sh):**
```bash
deploy_app() {
    echo -e "${COLOR_GREEN}Deploying application...${COLOR_RESET}"
    npm run build
    # 添加你的部署逻辑
}

# 在 case 语句中添加
case $CMD in
    # ... 其他命令
    deploy)
        deploy_app
        ;;
esac
```

## 贡献

如果你有改进建议或发现问题，欢迎提交 Issue 或 Pull Request。

## 许可证

与 CLIProxyAPIPlus 项目保持一致。
