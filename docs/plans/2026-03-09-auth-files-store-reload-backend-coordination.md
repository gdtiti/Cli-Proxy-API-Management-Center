# 认证文件批量运维与存储重载后端配合说明

> 目标读者：`CLIProxyAPIPlus` 后端开发 / 接口设计人员
>
> 目标：明确这次前端需求里，哪些能力需要后端配合，推荐怎样设计接口与运行态重载流程，避免做出“看起来有按钮、实际上只是重新 GET 一次”的假功能。

---

## 1. 背景与结论

本轮前端需求包含 3 类能力：

1. 认证文件批量下载工具
2. 配额页里“检查失败的认证文件”一键删除
3. 认证文件列表和配置文件“从数据库重载”

其中：

- **批量下载工具**：后端**不是必改项**
- **配额失败一键删除**：后端**不是必改项**
- **从数据库重载**：后端**必须改**

原因如下：

- 当前管理端已经有单文件下载接口 `GET /v0/management/auth-files/download?name=...`，前端可以复用它逐个拉取后在浏览器本地打 ZIP。
- 当前管理端已经有单文件删除接口 `DELETE /v0/management/auth-files?name=...`，前端可以基于配额检查结果筛出失败项后逐个删除。
- 当前管理端的“refresh / reload”本质只是重新请求现有接口；它**不会要求服务端从 PostgreSQL / 远端存储重新回灌本地镜像并刷新运行内存**。

所以，后端本轮真正要承担的是：

- 为“从数据库重载认证文件”提供**真实重载语义**
- 为“从数据库重载配置文件”提供**真实重载语义**

---

## 2. 当前现状

### 2.1 当前已有的管理接口

后端当前已注册：

- `GET /v0/management/auth-files`
- `GET /v0/management/auth-files/download`
- `POST /v0/management/auth-files`
- `DELETE /v0/management/auth-files`
- `PATCH /v0/management/auth-files/status`
- `GET /v0/management/config.yaml`
- `PUT /v0/management/config.yaml`

当前**没有**这类接口：

- “从数据库重载 auth files”
- “从数据库重载 config”
- “批量下载 ZIP”
- “删除当前 quota check 失败集合”

### 2.2 当前 PostgreSQL 模式的真实同步方向

当前 `PostgresStore` 在启动期会做两件事：

- `syncConfigFromDatabase(...)`
- `syncAuthFromDatabase(...)`

它们的用途是 **Bootstrap**，也就是：

- 启动时把数据库内容同步到本地 spool/config/auth 目录
- 然后让服务进程基于本地镜像运行

但这套逻辑当前**不是运行时管理接口**，而且并不适合直接原样暴露给前端按钮。

### 2.3 为什么不能把现有私有同步方法直接暴露

主要有 3 个原因：

#### A. `syncConfigFromDatabase()` 含有 Bootstrap 语义

它在数据库中没有配置记录时，会回退到：

- 从本地配置文件读取
- 或从模板复制
- 再反向持久化回数据库

这适合启动期兜底，不适合“用户明确要求从数据库重载”。

对“从数据库重载”来说，正确语义应该是：

- 数据库里有配置：从数据库拉回本地，并应用到运行态
- 数据库里没有配置：明确报错，不要偷偷拿本地或模板顶上

#### B. `syncAuthFromDatabase()` 当前会直接 `RemoveAll(authDir)`

这在启动期没问题，但运行中直接这么做有风险：

- 当前 watcher 是直接 watch `authDir` 根目录
- 直接整目录删掉再重建，可能导致 watcher 丢失监听、事件顺序混乱，或者触发不稳定的中间态

所以运行态 auth reload 不能简单复用“整目录删光再重建”的做法。

#### C. `GET /auth-files` 读的是运行内存，不是数据库

`ListAuthFiles` 当前优先走 `authManager.List()`。

这意味着：

- 就算后端把数据库内容写回了本地 mirror 文件
- 如果没有触发运行态 rescan / rebuild
- 前端立刻再请求 `GET /auth-files`，看到的仍可能是旧内存状态

所以“从数据库重载”必须分成两步：

1. **把存储层内容同步回本地镜像**
2. **刷新服务的运行态**

---

## 3. 推荐范围

### 3.1 本轮后端必须做

1. 新增“认证文件从存储重载”接口
2. 新增“配置文件从存储重载”接口
3. 为 PostgreSQL 模式实现真正可运行的 reload 逻辑
4. 将 reload 结果同步到服务运行态，而不只是改动磁盘文件

### 3.2 本轮后端不建议做

1. 不建议顺手做服务端 ZIP 批量下载接口
2. 不建议顺手做“删除 quota 失败文件集合”的服务端批量删除接口
3. 不建议把“从数据库重载”实现成“重新 GET 一次现有接口”
4. 不建议直接把 Bootstrap 私有方法作为 HTTP handler 暴露

---

## 4. 推荐接口设计

## 4.1 路由命名建议

推荐新增两个 action endpoint：

- `POST /v0/management/auth-files/reload-from-store`
- `POST /v0/management/config.yaml/reload-from-store`

说明：

- 这里故意使用 `store` 而不是写死 `database`
- Phase 1 可以只支持 `postgres`
- 未来如果 object store / git store 也具备远端为 canonical source 的能力，可以复用同一路由语义

如果后端强烈不喜欢在 `config.yaml` 资源下挂 action，也可以改成：

- `POST /v0/management/config/reload-from-store`

但前后端需要统一，避免一轮实现里出现两套命名。

## 4.2 请求体建议

Phase 1 可以先使用**空请求体**。

如果后端希望给未来留扩展点，可以接受如下可选字段：

```json
{
  "dry_run": false
}
```

但本轮前端不依赖这些扩展参数。

## 4.3 返回体建议

### `POST /auth-files/reload-from-store`

成功示例：

```json
{
  "ok": true,
  "store_type": "postgres",
  "message": "auth files reloaded from store",
  "summary": {
    "written": 12,
    "removed": 3,
    "before_runtime_count": 18,
    "after_runtime_count": 15,
    "runtime_rescanned": true
  }
}
```

### `POST /config.yaml/reload-from-store`

成功示例：

```json
{
  "ok": true,
  "store_type": "postgres",
  "message": "config reloaded from store",
  "summary": {
    "config_changed": true,
    "runtime_reloaded": true
  }
}
```

### 失败返回建议

- `409 Conflict`
  - 当前运行模式不是“可从远端存储回灌”的模式
  - 例如本地 file store
- `422 Unprocessable Entity`
  - 从存储取回的配置内容无法通过配置校验
- `500 Internal Server Error`
  - 存储读取失败
  - 本地镜像写入失败
  - 运行态刷新失败

错误体建议统一：

```json
{
  "error": "store_reload_unsupported",
  "message": "current token store does not support reload-from-store"
}
```

或：

```json
{
  "error": "store_reload_failed",
  "message": "failed to reload auth files from postgres store"
}
```

---

## 5. 推荐后端抽象

不建议把 management handler 直接绑死到 `PostgresStore` 具体类型。

推荐新增两个小接口，由支持远端回灌的 store 实现：

```go
type ConfigReloadFromStoreCapable interface {
    ReloadConfigFromStore(ctx context.Context) (*ReloadConfigResult, error)
}

type AuthReloadFromStoreCapable interface {
    ReloadAuthFilesFromStore(ctx context.Context) (*ReloadAuthFilesResult, error)
}
```

结果结构可以类似：

```go
type ReloadConfigResult struct {
    StoreType string
    Changed   bool
}

type ReloadAuthFilesResult struct {
    StoreType string
    Written   int
    Removed   int
}
```

### 设计理由

- management 层只判断“当前 store 是否支持 reload-from-store”
- `postgres` 先实现
- `object store / git store` 后续如需支持，也只要补接口实现

---

## 6. 运行态刷新建议

光把数据写回本地镜像不够，必须把服务运行态也刷新掉。

推荐由 `Server` 向 `management.Handler` 注入两个 hook，而不是让 handler 直接耦合 watcher 内部实现。

示例：

```go
type RuntimeReloadHooks struct {
    ReloadConfigFromFile func() error
    RescanAuthFiles      func() error
}
```

`management.Handler` 可增加：

```go
func (h *Handler) SetRuntimeReloadHooks(hooks RuntimeReloadHooks)
```

### 推荐语义

#### 配置 reload

1. 从 store 拉取 config 内容
2. 写回本地 `config.yaml`
3. 调用 `ReloadConfigFromFile`
4. 同步更新运行态 config / clients / modules

#### 认证文件 reload

1. 从 store 拉取 auth records
2. 用**运行态安全方式**同步到本地 auth mirror
3. 调用 `RescanAuthFiles`
4. 让 `authManager.List()` 反映最新状态

---

## 7. PostgreSQL 实现建议

## 7.1 Config reload

**不要**直接把 `syncConfigFromDatabase()` 原样作为运行态 reload。

推荐单独拆出一个“严格版”方法，例如：

```go
func (s *PostgresStore) ReloadConfigFromStore(ctx context.Context) (*ReloadConfigResult, error)
```

要求：

1. 只从数据库读取 `config` 表中的 canonical config
2. 若数据库无记录，返回明确错误
3. 不允许 fallback 到本地文件
4. 不允许用模板种子偷偷补库
5. 写回本地 config 文件后返回 `Changed` 结果

## 7.2 Auth reload

**不要**直接沿用 `syncAuthFromDatabase()` 里的 `RemoveAll(authDir)` 逻辑。

推荐新增一个“增量同步版”方法，例如：

```go
func (s *PostgresStore) ReloadAuthFilesFromStore(ctx context.Context) (*ReloadAuthFilesResult, error)
```

要求：

1. 从数据库列出所有 auth records
2. 计算目标文件集合
3. 对存在记录：
   - 内容相同则跳过
   - 内容不同则临时文件写入后原子替换
4. 对本地多余文件：
   - 逐个删除
   - 不要删除整个根目录
5. 返回 `written / removed` 计数

### 为什么必须增量同步

- watcher 当前监听的是 auth 目录本身
- 删除根目录会让监听对象失效或进入不稳定状态
- 增量更新更适合运行中触发

---

## 8. 并发与一致性要求

reload 是运维动作，不是普通查询。建议后端加串行保护。

### 最低要求

1. `reload-from-store` 过程串行化
2. reload 期间禁止并发 upload / delete / status patch 与其交叉覆盖
3. 成功响应必须表示：
   - 本地 mirror 已完成同步
   - 运行态已刷新

### 不建议的行为

- 文件刚写一半就返回 `200`
- 只写磁盘不刷新内存也返回成功
- 运行态失败但仍返回 `ok: true`

---

## 9. 与前端的最小契约

后端只要给出以下能力，前端就可以接：

### 9.1 不需要后端配合的新功能

- 认证文件批量下载：
  - 前端复用单文件下载接口
  - 浏览器本地打 ZIP

- 配额页失败项一键删除：
  - 前端基于当前 quota check 的 `error` 集合
  - 逐个调用现有删除接口

### 9.2 需要后端配合的新功能

- 认证文件从 store 重载
- 配置文件从 store 重载

如果后端暂时不做能力探测接口，前端可先直接调用 reload endpoint。

当后端返回 `409/501` 时，前端会按“当前运行模式不支持从数据库重载”给出提示，而不是伪装成功。

---

## 10. 推荐落点文件

后端大概率会涉及这些文件：

- `CLIProxyAPIPlus/internal/api/handlers/management/handler.go`
- `CLIProxyAPIPlus/internal/api/handlers/management/auth_files.go`
- `CLIProxyAPIPlus/internal/api/handlers/management/config_basic.go`
- `CLIProxyAPIPlus/internal/api/server.go`
- `CLIProxyAPIPlus/internal/store/postgresstore.go`

如果要暴露 runtime rescan hook，可能还会涉及：

- `CLIProxyAPIPlus/internal/watcher/watcher.go`
- `CLIProxyAPIPlus/internal/watcher/config_reload.go`
- `CLIProxyAPIPlus/internal/watcher/clients.go`

---

## 11. 验收真相陈述

后端交付完成后，至少应满足以下可验证事实：

1. 在 PostgreSQL 模式下调用 `POST /v0/management/auth-files/reload-from-store` 后，不重启服务即可通过 `GET /v0/management/auth-files` 看到数据库中的最新认证文件集合。
2. 在 PostgreSQL 模式下调用 `POST /v0/management/config.yaml/reload-from-store` 后，不重启服务即可让当前服务实例应用数据库中的最新配置。
3. 当当前运行模式不支持远端 store reload 时，reload 接口返回明确失败，而不是静默成功。
4. 运行态 auth reload 不会通过删除整个 auth 根目录来完成同步。
5. reload 成功响应只会在“本地镜像已同步 + 运行态已刷新”后返回。

---

## 12. 最终建议

推荐按下面顺序实施：

1. 先做 `config reload-from-store`
   - 风险更小
   - 更容易验证
2. 再做 `auth-files reload-from-store`
   - 需要处理 watcher / runtime rescan / 增量文件同步
3. 前端最后接入按钮与提示文案

如果要压缩范围，本轮后端最小必做集是：

- `POST /v0/management/config.yaml/reload-from-store`
- `POST /v0/management/auth-files/reload-from-store`
- PostgreSQL 模式下的真实实现
- 非支持模式下的明确错误返回

