# Forge 使用说明

本文档说明当前仓库的实际可用用法，重点覆盖安装、启动、登录、非交互调用和排障路径。

## 启动方式

### 通过 npm 全局安装

```bash
npm install -g forge-coder
```

安装完成后可直接使用：

```bash
forge --version
forge --help
forge auth status
```

包安装过程会同时准备 Bun 运行时，通常不需要额外手动安装。如果要强制指定 Bun 路径，可设置：

```bash
export BUN_BIN=/path/to/bun
```

### 通过源码目录启动

```bash
npm install
forge --version
forge
```

如果当前 shell 还没有刷新 PATH，可先使用：

```bash
npx forge --version
npx forge
```

`npm install` 会自动触发 `npm run setup:path`，尝试在 `~/.local/bin` 中创建 `forge` 启动器，并在需要时修复 shell 的 PATH 配置。

### 通过开发脚本启动

最稳定的开发态入口：

```bash
bash scripts/run-forge-cli.sh
```

对应检查命令：

```bash
bash scripts/run-forge-cli.sh --version
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

仓库脚本等价入口：

```bash
npm start
npm run version
```

## 启动机制

当前项目的真实启动流程如下：

```text
forge
  -> bin/forge.js
  -> 定位 Bun 运行时
  -> bun run src/entrypoints/cli.tsx
  -> src/main.tsx
  -> 进入交互界面、--print、auth 或其他子命令
```

不同入口的区别：

- `forge`：最适合日常使用，直接进入启动包装器。
- `npx forge`：适合 PATH 还没刷新时使用，本质上仍然调用同一个 `bin/forge.js`。
- `npm start`：会先执行 `bun run generate`，再进入 `scripts/run-forge-cli.sh`，更适合开发调试。
- `bash scripts/run-forge-cli.sh`：最接近底层的开发入口，适合排查启动问题。

与旧版本不同，当前启动阶段默认不再依赖启动时外网预取。Forge 会先完成本地配置读取、命令注册和界面初始化，再进入欢迎页或命令执行阶段。

### 推荐的启动排查顺序

先确认命令入口正常：

```bash
forge --version
forge --help
```

再确认界面是否能够起来：

```bash
forge
```

如果怀疑是本地配置导致的问题，用临时 `HOME` 重新验证：

```bash
mkdir -p /tmp/forge-start-home
HOME=/tmp/forge-start-home forge
```

如果这样可以正常进入界面，说明启动链路本身没有坏，问题更可能出在原有配置目录或历史状态。

## 登录方式

### 推荐方式：导入 Codex CLI 登录

1. 先完成 Codex CLI 登录：

```bash
codex login
codex login status
```

2. 导入到 Forge：

```bash
bash scripts/run-forge-cli.sh auth login --openai
```

3. 确认登录状态：

```bash
bash scripts/run-forge-cli.sh auth status
```

预期关键信息：

- `loggedIn: true`
- `authMethod: "openai_session"`
- `authProvider: "openai"`

### 兼容读取已有本地登录状态

如果本地配置目录中已经存在旧格式登录信息，Forge 仍会通过兼容层读取。这适合历史环境迁移，不建议新环境优先依赖。

## 交互式 REPL

启动交互会话：

```bash
bash scripts/run-forge-cli.sh
```

也可以直接附带首条提示词：

```bash
bash scripts/run-forge-cli.sh "请总结这个仓库的主要结构。"
```

## 非交互模式

最小 `--print` 请求：

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

当前适合的场景：

- shell 脚本调用
- 冒烟测试
- 简单文本问答

## 当前 OpenAI 运行行为

当前登录链路分成两类情况：

1. Codex CLI 提供了可直接使用的 OpenAI 凭据。
   Forge 会优先走原生 OpenAI 路径。

2. 本地只有受限的 OAuth 会话凭据。
   Forge 仍能成功登录，但部分简单文本请求会走 `codex exec` 兼容路径。

这意味着：

- 登录导入是可用的
- 最小文本请求是可用的
- 更完整的原生 OpenAI 工具能力仍在补齐

## 常用命令

```bash
forge --help
forge auth status
forge auth login --openai
forge doctor
forge update
```

如果你在源码目录中调试，也可以继续使用：

```bash
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

交互界面中的命令范围更广，包含认证、插件、MCP、诊断、状态、内存和模型相关命令。

## 常用项目脚本

```bash
npm run generate
npm run recovery:audit
npm run preflight:openai
node scripts/mock-forge-gateway.mjs
```

作用说明：

- `generate`：重新生成派生的 SDK 类型和设置结构
- `recovery:audit`：检查关键恢复链路是否回退
- `preflight:openai`：检查本机 OpenAI/Codex 登录准备情况
- `mock-forge-gateway.mjs`：用于兼容桥接链路的本地测试

## 故障排查

### `auth login --openai` 成功，但请求失败

执行：

```bash
node scripts/openai-oauth-preflight.mjs
```

如果输出表明本地只有受限的 OAuth 会话，而没有完整的 Responses 能力，那么 Forge 仍可导入登录，但只能覆盖较简单的兼容请求路径。

### `auth status` 看起来不对

使用独立配置目录重新验证：

```bash
FORGE_CONFIG_DIR="$(mktemp -d /tmp/forge-auth-test.XXXXXX)" \
  bash scripts/run-forge-cli.sh auth login --openai
```

后续的 `auth status` 和 `--print` 也继续复用同一个 `FORGE_CONFIG_DIR`。

### 执行 `forge` 时提示命令不存在

先执行：

```bash
npm run setup:path
```

如果脚本已经写入 PATH 配置，重新打开一个终端再试：

```bash
forge --version
```

### CLI 能启动，但行为异常

重新跑一遍核心检查：

```bash
npm run generate
npm run recovery:audit
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

## 当前限制

- 原生 OpenAI 工具调用覆盖仍不完整
- 一些高级能力仍依赖兼容层，不是完全收敛后的最终实现
- 不同安装方式下的自动更新体验还没有完全统一
