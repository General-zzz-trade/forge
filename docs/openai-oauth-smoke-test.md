# OpenAI 登录冒烟测试

本文档用于验证 Forge 是否能够复用本机 Codex CLI 的登录状态，并在最小场景下完成一次真实请求。

关键点只有两个：

- Forge 能否成功导入 Codex CLI 登录并创建 `openai_session`
- Forge 当前能否直接走原生 OpenAI 路径，取决于本机实际可用的凭据类型

当前行为如下：

- 如果 Codex CLI 提供了可直接调用的 OpenAI 凭据，Forge 会走原生 OpenAI 路径
- 如果本机只有受限的 OAuth 会话，Forge 仍可登录成功，但简单文本请求可能退回 `codex exec` 兼容路径

## 推荐验证流程

### 1. 登录 Codex CLI

```bash
codex login
codex login status
```

只要 `codex login status` 显示已登录，即可继续下一步。

### 2. 运行 Forge 预检脚本

```bash
node scripts/openai-oauth-preflight.mjs
```

重点关注：

- `credentialKind=api_key` 或等价输出：说明原生路径条件较好
- `oauth_access_token` 且提示缺少 `api.responses.write`：说明登录导入可用，但原生能力覆盖有限

### 3. 将登录状态导入 Forge

```bash
bash scripts/run-forge-cli.sh auth login --openai
```

### 4. 检查会话状态

```bash
bash scripts/run-forge-cli.sh auth status
```

期望至少看到：

- `loggedIn: true`
- `authMethod: "openai_session"`
- `authProvider: "openai"`
- `sessionIssuer: "openai"`
- `modelProvider: "openai"`

### 5. 执行一次最小真实请求

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

预期输出：

```text
OK
```

## 这个测试实际证明了什么

通过上面的流程，能够证明：

- Codex CLI 登录复用链路可用
- Forge 可以创建并持久化 `openai_session`
- Forge 至少能在无工具场景下完成一次真实请求

不能证明：

- 原生 OpenAI 工具调用已经完整覆盖
- 所有复杂多轮桥接场景都已稳定
- 所有历史兼容特性都已经迁移完成

## 可选的浏览器 OAuth 路径

Forge 仍保留单独的浏览器 OAuth 流程，但它已经不是默认推荐路径。只有在你明确希望 Forge 自己管理 OpenAI OAuth，而不是复用 Codex CLI 登录时，才需要这条路径。

该路径依赖 `FORGE_OPENAI_CLIENT_ID` 等相关环境变量。

## 兼容桥接验证

如果你在测试旧桥接链路，可以启动本地 mock 服务：

```bash
node scripts/mock-forge-gateway.mjs
```

但对当前推荐的登录验证来说，这一步不是必需条件。

## 故障排查

### 登录导入成功，但原生请求失败

执行：

```bash
node scripts/openai-oauth-preflight.mjs
```

如果结果显示当前只有受限的 OAuth 会话，没有完整的 Responses 能力，这通常说明原生 OpenAI 路径覆盖不足。此时 Forge 仍应能处理简单文本请求，但不代表所有高级能力都可用。

### `auth login --openai` 成功，但 `auth status` 不是 `openai_session`

确认两次命令使用的是同一套配置目录和同一个启动入口。隔离验证时，建议固定临时目录：

```bash
FORGE_CONFIG_DIR="$(mktemp -d /tmp/forge-auth-test.XXXXXX)" \
  bash scripts/run-forge-cli.sh auth login --openai
```

随后继续使用相同的 `FORGE_CONFIG_DIR` 执行 `auth status` 和 `--print`。
