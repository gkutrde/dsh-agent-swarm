# 第三方代码与来源声明

本仓 `dsh-agent-swarm` 是 **DeepSeek Harness（DSH）插件**：把「一批同形子任务」打包成一个模型可调用的 `agent_swarm` 工具，一次调用展开为 N 个并行子任务，自带限流感知调度与安全汇总。

## 1. 是否包含第三方源码

**本仓未复制任何第三方源代码，也未复制任何第三方提示词原文。** 所有 `src/**` 均为本仓自行撰写。

- 调度策略（首波并发、放量间隔、指数退避、容量收缩与恢复、死锁防护、中断级联取消、任务超时钳位）是**通用的限流调度做法**，本仓以自拟代码实现；
- 面向模型的工具描述（`src/tool.ts` 的 `AGENT_SWARM_DESCRIPTION` / `DESCRIPTION_*`）为**本仓自拟英文文案**；
- 错误文案集中在 `src/specs.ts` 的 `ERRORS` 与 `src/scheduler.ts` 的常量导出，可按关键字复核；
- 测试用例全部自拟，见 `test/`。

### 可复核的核对方法

```bash
# ① 工具描述：本仓自拟（无外部原文对照物，故以“自拟”声明 + git 历史佐证）
grep -n 'AGENT_SWARM_DESCRIPTION\|DESCRIPTION_' src/tool.ts | head
# ② 错误文案与调度常量：集中可查
grep -n 'ERRORS = {\|SUSPENDED_REASON\|TIMEOUT_MESSAGE' src/specs.ts src/scheduler.ts
# ③ 依赖面：仅 cordis（peer）+ schemastery（dev），无运行时第三方依赖
cat package.json
```

## 2. 依赖与许可

| 依赖 | 类型 | 用途 | 许可（上游声明） |
| --- | --- | --- | --- |
| `cordis` | peer（不随包分发） | DSH 插件框架（`ctx.effect` / `ctx.get` / `ctx.provide`） | 见上游仓库 |
| `schemastery` | dev | 配置 schema（`Config`） | 见上游仓库 |
| `tsdown` / `typescript` / `@types/node` | dev | 构建与类型检查 | MIT |

**运行时无第三方依赖**（`dependencies` 为空）——插件只使用宿主注入的服务（`ctx.llm` / `ctx.get('subagents')` / `ctx.logger` 等），不 import 任何 `@deepseek-ai/*` 包。

## 3. 与既有同类实现的关系（登记，非署名义务）

- 本仓与其它同蓝图实现（例如 `ase-sketch/dsh-agent-swarm`）**互不派生**：两者各自独立撰写，代码不共享；
- 本仓**不声称完整复刻**任何上游产品；有意保留的行为差异（例如：额外提供「路径 A（无工具的一次调用）」「自动路径选择」「续跑接力」「token 用量与失败原因」「批次状态注册表服务」）视为本仓设计取舍；
- 若你发现本仓任何片段与第三方作品构成实质相似，请在 Issue 中指出具体文件与行号，我们会核实并改写或补署名。

## 4. 数据与隐私

插件不采集、不上传任何用户数据；批次的输入/输出仅存在于宿主进程与会话记录中。
