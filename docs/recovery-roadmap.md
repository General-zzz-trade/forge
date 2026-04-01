# Forge 恢复与演进路线图

这个仓库已经走出“只能勉强启动”的阶段，当前重点从恢复可运行，转向稳定性、清理和发行体验。

## 当前基线

本地已验证：

- `npm run generate`
- `node scripts/recovery-audit.mjs`
- `bash scripts/run-forge-cli.sh --version`
- `bash scripts/run-forge-cli.sh --help`
- `bash scripts/run-forge-cli.sh auth status`
- `bash scripts/run-forge-cli.sh --print "Reply with the single word OK." --disable-slash-commands --tools "" --max-turns 1`
- `bash scripts/run-forge-cli.sh auth login --openai`

这说明当前至少具备：

- CLI 可启动
- 派生产物可重新生成
- 恢复审计可通过
- OpenAI 登录导入可用
- 最小无工具请求可跑通

## 已完成的恢复项

### 构建与生成

- 补齐包清单与脚本入口
- 可重新生成 SDK 桥接文件
- 可重新生成设置结构
- 提供 `scripts/run-forge-cli.sh` 作为稳定的开发启动入口

### 运行时

- CLI 启动
- 命令注册
- 非交互 `--print`
- 交互式 REPL
- `ripgrep` 回退机制
- 主请求路径

### 登录与认证

- 兼容读取历史本地登录状态
- 通过 Codex CLI 导入 OpenAI 登录
- 保留可选浏览器 OAuth 路径

### 已清理的历史阻塞项

恢复审计表明，早期几个会导致仓库无法正常工作的阻塞项已经被移除或替换，包括本地 stub、占位文件和缺失的打包产物。

## 剩余工作

### 1. OpenAI 运行路径补齐

当前 OpenAI 路径已经可用，但还不完整。下一阶段应继续补齐：

- 工具调用
- 更复杂的多轮交互
- 更稳定的结构化输出
- 运行层中对历史兼容假设的进一步收敛

### 2. 构建正式化

目前开发启动仍在运行时注入一部分构建元信息，这适合本地调试，但不够适合作为最终发行形态。

目标：

- 将版本和构建信息前移到构建阶段
- 降低对启动包装器的耦合

### 3. 对外命名清理

当前公开表面基本已经统一为 Forge，但兼容层和历史模块里仍有旧命名残留。

目标：

- 继续清理非兼容边界中的历史命名
- 保留必要的兼容层，但避免继续向外扩散

### 4. 回归验证覆盖

项目需要一套可重复执行的“已知良好”检查集。

最低建议覆盖：

- 启动
- `--help`
- `auth status`
- `auth login --openai`
- 一次真实 `--print` 请求
- 基础工具冒烟测试

## 建议里程碑

1. 稳定 OpenAI 工具调用和多轮行为。
2. 增加端到端冒烟脚本，纳入发版前检查。
3. 正式化构建元数据注入，减少对开发启动脚本的依赖。
4. 持续缩小历史兼容命名在活跃代码中的暴露范围。

## 审计命令

```bash
node scripts/recovery-audit.mjs
```

这是当前判断仓库是否回退到“只能靠临时修补启动”的最快检查方式。
