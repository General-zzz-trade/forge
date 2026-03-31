# Forge — CLI Agent 设计文档

**日期**：2026-04-01
**状态**：已批准，待实现

---

## 概述

Forge 是一个面向团队/企业的终端 REPL CLI Agent，核心能力是通过 Leader-Worker 多进程架构实现多 Agent 并行协作，支持多模型路由，并提供可配置的团队权限策略。

---

## 目标用户

团队 / 企业开发者，典型场景：
- 多人共享同一 Forge 配置，统一权限策略
- 并行处理复杂任务（如：重构 + 安全扫描 + 测试更新同步进行）
- 企业合规要求（审计日志、操作确认、沙箱路径）

---

## 核心需求

| 需求 | 描述 |
|------|------|
| 终端 REPL | 交互式命令行界面，流式输出，内联 Dialog |
| 多 Agent 并行 | Leader 拆解任务派生多个 Worker 并行执行 |
| 多模型支持 | Claude / GPT / Gemini / 本地模型（Ollama）可切换 |
| 可配置权限 | 管理员下发团队策略，角色级权限控制 |
| 审计日志 | 所有工具调用完整记录 |

---

## 架构设计

### 整体分层

```
┌─────────────────────────────────────────────┐
│              用户终端 (REPL)                  │
│         forge  ›  输入 / 输出渲染              │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│              Leader Agent                   │
│  · 解析用户意图                               │
│  · 拆解任务 → 子任务列表                       │
│  · 派生 / 回收 Worker                         │
│  · 汇总结果 → 返回用户                         │
│  · 执行团队权限策略                            │
└──────┬───────────────┬───────────────┬───────┘
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│  Worker A   │ │  Worker B   │ │  Worker C   │
│  (文件操作)  │ │  (代码搜索)  │ │  (Shell执行) │
│  Model: X   │ │  Model: Y   │ │  Model: Z   │
└─────────────┘ └─────────────┘ └─────────────┘
       │               │               │
┌──────▼───────────────▼───────────────▼───────┐
│              工具执行层                        │
│  FileRead · FileEdit · Bash · Grep · Web      │
└───────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────┐
│           模型适配层 (ModelRouter)             │
│   Claude · GPT · Gemini · 本地模型 (Ollama)   │
└──────────────────────────────────────────────┘
```

### 进程模型

- Leader 和 Worker 运行在独立进程，通过 IPC 通信
- Worker 之间不直接通信，全部通过 Leader 中转
- Worker 超时自动终止（可配置，默认 5 分钟）

---

## 权限系统

### 配置文件层级

```
forge.team.json        团队级，管理员控制，版本库提交
forge.local.json       个人级，继承团队策略，gitignore
```

### 团队配置结构

```jsonc
{
  "roles": {
    "admin":  { "tools": "*" },
    "dev":    { "tools": ["file_read", "file_edit", "bash"], "allowedPaths": ["/workspace/**"] },
    "viewer": { "tools": ["file_read", "grep", "glob"] }
  },
  "policies": {
    "requireConfirm": ["bash", "file_write"],
    "blockedTools":   ["web_fetch"],
    "allowedPaths":   ["/workspace/**"]
  }
}
```

### 权限决策流程

```
Worker 请求执行工具
  → Leader 检查 role 权限
  → 检查 blockedTools
  → 检查 allowedPaths 沙箱
  → requireConfirm？→ 暂停，询问用户（y/n/a）
  → 通过 → 执行 → 写入审计日志
```

---

## 模型路由

### 统一接口

```typescript
interface ModelProvider {
  stream(messages: Message[], tools: Tool[], config: ModelConfig): AsyncGenerator<Delta>
}
```

### 支持的 Provider

| Provider | 模型示例 |
|----------|---------|
| anthropic | claude-opus-4, claude-sonnet-4, claude-haiku-4 |
| openai | gpt-4o, gpt-4o-mini |
| google | gemini-1.5-pro, gemini-1.5-flash |
| ollama | llama3, qwen2.5-coder（本地） |

### 任务-模型映射

```
complex_reasoning  → heavy 模型（管理员配置）
code_search        → light 模型
shell_validation   → light 模型
user_conversation  → default 模型
```

---

## Worker 生命周期

```
Leader 拆解任务
  → spawn Worker(taskSpec, model, permissions)
    → Worker 初始化（独立上下文，继承沙箱路径）
    → 执行循环：query → tool calls → results
    → 完成 → 发送 TaskResult 给 Leader
  → Leader 汇总所有 Worker 结果
  → 回收 Worker 进程
  → 生成最终回复给用户
```

**Worker 隔离保证：**
- 独立文件操作上下文（防止并发写冲突）
- 权限继承自 Leader，无法自行提权
- 超时自动终止

---

## REPL 交互

### 技术选型

- **React + Ink**：终端内组件化渲染
- 实时流式输出（打字机效果）
- Worker 进度面板（并行任务可视化）
- 权限确认 Dialog（内联，不跳出终端）
- 主题支持：light / dark / high-contrast

### 交互示意

```
forge › 帮我重构 src/auth 模块，同时检查有没有安全漏洞

  ◆ Leader  分析任务...
  ├─ ◎ Worker A  [claude-opus]   重构 auth/login.ts
  ├─ ◎ Worker B  [claude-haiku]  扫描安全漏洞
  └─ ◎ Worker C  [claude-haiku]  更新相关测试

  ⚠ Worker A 请求执行写操作: src/auth/login.ts
  → 允许(y) / 拒绝(n) / 本次全部允许(a) › _
```

### 内置命令

| 命令 | 功能 |
|------|------|
| `/model <name>` | 切换当前会话模型 |
| `/workers` | 查看当前 Worker 状态 |
| `/policy` | 查看/临时调整权限策略 |
| `/log` | 查看审计日志 |
| `/compact` | 压缩上下文 |
| `/resume` | 恢复上次会话 |
| `/config` | 打开配置 |
| `/help` | 帮助 |

---

## 会话持久化

- 每次会话自动保存到 `~/.forge/sessions/`
- `/resume` 列出历史会话并恢复完整上下文
- 审计日志保存到 `~/.forge/audit/YYYY-MM-DD.jsonl`

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Bun |
| 语言 | TypeScript (strict) |
| 终端 UI | React + Ink |
| CLI 解析 | Commander.js |
| Schema 校验 | Zod |
| 进程通信 | Node.js IPC / child_process |
| 代码搜索 | ripgrep |

---

## 不在范围内（v1）

- Web UI
- 插件市场
- 云端会话同步
- IDE 扩展集成
