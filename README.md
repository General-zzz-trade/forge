# Forge

Forge 是一个面向终端场景的本地编码助手，提供可运行的 CLI、交互式 REPL、非交互 `--print` 模式，以及基于 OpenAI/Codex 的登录复用能力。当前仓库已经可以完成安装、启动、登录校验和最小请求闭环，不再只是“能编译但不能用”的恢复版本。

## 当前状态

本地已验证：

- `bash scripts/run-forge-cli.sh --version`
- `bash scripts/run-forge-cli.sh --help`
- `bash scripts/run-forge-cli.sh auth status`
- `bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1`
- `bash scripts/run-forge-cli.sh auth login --openai`
- `node scripts/recovery-audit.mjs`

目前已经稳定的部分：

- npm 安装后可直接获得 `forge` 启动入口
- Bun 运行时通过 npm 依赖自动安装
- CLI、REPL、`--print` 路径可正常工作
- 派生代码与设置结构可重新生成
- OpenAI 登录可通过 Codex CLI 复用

当前仍在继续完善的部分：

- 原生 OpenAI 运行路径尚未覆盖所有工具调用与多轮场景
- 如果本机只有受限的 OAuth 凭据，部分请求会退回 `codex exec` 兼容路径
- 一些兼容层命名和历史模块边界仍待清理

## 快速开始

### 通过 npm 全局安装

发布包名：

```bash
npm install -g forge-coder
```

安装后可直接执行：

```bash
forge --version
forge --help
forge auth status
```

默认情况下不需要单独安装 Bun。如果你希望强制使用指定运行时，可以设置：

```bash
export BUN_BIN=/path/to/bun
```

### 通过源码目录启动

在仓库根目录执行：

```bash
npm install
forge --version
forge
```

如果当前终端还没有刷新 PATH，也可以先使用：

```bash
npx forge --version
npx forge
```

`npm install` 会自动执行 `npm run setup:path`，尝试完成两件事：

- 在 `~/.local/bin` 下创建 `forge` 启动包装器
- 如果需要，将 `~/.local/bin` 写入当前 shell 的 PATH 配置

如需手动重跑：

```bash
npm run setup:path
```

仓库脚本入口：

```bash
npm start
npm run version
npm run recovery:audit
npm run preflight:openai
```

### 直接使用仓库启动脚本

如果你需要最明确的开发态入口，可直接运行：

```bash
bash scripts/run-forge-cli.sh
```

常用检查命令：

```bash
bash scripts/run-forge-cli.sh --version
bash scripts/run-forge-cli.sh --help
bash scripts/run-forge-cli.sh auth status
```

最小非交互验证：

```bash
bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1
```

## 登录与认证

### 推荐方式：复用 Codex CLI 登录

1. 先登录 Codex CLI：

```bash
codex login
codex login status
```

2. 将登录状态导入 Forge：

```bash
bash scripts/run-forge-cli.sh auth login --openai
```

3. 检查结果：

```bash
bash scripts/run-forge-cli.sh auth status
```

如果导入后的凭据具备可用的 API Key 或 Responses 能力，Forge 会直接走原生 OpenAI 路径；如果只有受限的会话凭据，Forge 仍可完成登录，并在简单文本请求场景下退回兼容执行路径。

详细验证流程见 [docs/openai-oauth-smoke-test.md](docs/openai-oauth-smoke-test.md)。

### 兼容读取已有本地登录状态

如果你的本地配置目录里已经存在旧格式登录信息，Forge 仍会通过兼容层读取它。这条路径主要用于历史环境延续，不建议作为新环境的首选方式。

## 架构概览

代码库目前仍以大型模块化 CLI 为主，几个核心入口如下：

- `src/entrypoints/cli.tsx`：CLI 入口
- `src/main.tsx`：启动编排与模式分发
- `src/cli/print.ts`：非交互执行路径
- `src/QueryEngine.ts`：主查询循环
- `src/services/api/openai.ts`：OpenAI 请求与兼容分发
- `src/tools.ts`：内置工具注册
- `src/commands.ts`：命令注册

按目录划分：

- `src/commands/`：命令与交互动作
- `src/tools/`：工具实现
- `src/components/`、`src/screens/`：终端界面
- `src/services/`：API、认证、MCP、同步与分析能力
- `src/utils/`：路径、配置、权限、存储与适配器
- `src/bridge/`：桥接层
- `src/skills/`、`src/plugins/`：扩展能力

## 文档索引

- [使用说明](docs/usage.md)
- [OpenAI 登录冒烟测试](docs/openai-oauth-smoke-test.md)
- [恢复与演进路线图](docs/recovery-roadmap.md)
- [Forge 设计说明](docs/superpowers/specs/2026-04-01-forge-design.md)

## 现阶段限制

- 当前仓库是可运行版本，但还没有完全收敛成正式发行态
- OpenAI 支持已可用，但高级工具场景仍在持续补齐
- 部分兼容层仍服务于历史环境迁移，不代表最终形态
- 自动更新链路已具备基础能力，但不同安装方式的体验仍有差异

## 建议的后续工作

1. 继续补齐 OpenAI 工具调用和多轮行为。
2. 收敛兼容层命名，减少历史遗留暴露到公开表面。
3. 进一步正式化构建产物元数据，降低对启动包装器的依赖。
4. 增加可重复执行的 REPL、`--print`、登录、工具回归检查。
