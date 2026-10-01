# 架构（一页读完）

> 目标读者：想改这个插件的人。这里只写**必要的结构与踩过的坑**，不重复 README 的用法。

## 1. 模块职责

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `src/index.ts` | 插件入口：解析 `Config`、按配置选择执行路径、注册工具、接线观测面、暴露宿主服务 | `name` / `inject` / `Config` / `apply` |
| `src/tool.ts` | 工具定义：参数解析与前置校验、组装 tasks、跑批、渲染、结构化值、参数/输出 schema | `createAgentSwarmTool` / `AGENT_SWARM_PARAMETERS` / `AGENT_SWARM_OUTPUT` |
| `src/specs.ts` | 规格展开与**七道前置校验**（零子任务启动保证）、占位符展开、去重键 | `createSwarmSpecs` / `ERRORS` |
| `src/scheduler.ts` | 调度内核：爬坡、限流退避与重排队、容量收缩/恢复、死锁防护、超时与取消、结果落位 | `SwarmBatch` / `runSwarmBatch` / `mergeUsage` |
| `src/routing.ts` | 自动路径判定（`subagentProvider: auto`） | `detectPathMode` |
| `src/launcher-llm.ts` | **路径 A** 执行层：一次流式调用，聚合正文/用量/限流/失败原因 | `createLlmLauncher` |
| `src/launcher-subagent.ts` | **路径 B** 执行层：宿主子代理（有工具、多轮） | `createSubagentLauncher` |
| `src/launcher-continuable.ts` | **路径 B 续跑**执行层：`startContinuable` + `sendMessage` + 状态轮询 | `createContinuableSubagentLauncher` |
| `src/render.ts` | 汇总渲染：动态围栏、按码点安全截断、结构化值 | `renderSwarmResults` / `swarmResultValue` / `sliceAtCodePoint` |
| `src/registry.ts` | 批次状态注册表（宿主服务 `agentSwarmRegistry`） | `SwarmRegistry` |

## 2. 调度常量（改动前请先看用例）

| 项 | 值 | 位置 |
| --- | --- | --- |
| 首波并发 | 5 | `scheduler.ts` `INITIAL_LAUNCH_LIMIT` |
| 放量间隔 | 700ms | `INITIAL_LAUNCH_INTERVAL_MS` |
| 限流退避 | `3s × 2ⁿ`（默认无抖动） | `RATE_LIMIT_RETRY_BASE_MS` |
| 容量收缩 / 恢复 | 2s 一档，上限 180s | `RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS` |
| 单任务超时 | 默认 2h（可配，0 = 不设） | `Config.timeoutMs` |
| 批级上限 | 4h | `Config.toolTimeoutMs` |

## 3. 两条执行路径

```
agent_swarm(args, exec)
  ├─ ① 解析 + ② 七道校验 (specs.ts)          ← 任何失败都在这里，零子任务启动
  ├─ ③ 判定提示 detectPathMode(items, tpl)   ← routing.ts
  ├─ ④ 选执行层 (index.ts)
  │     subagentProvider: ''      固定路径 A
  │                      'spawn'  固定路径 B
  │                      'auto'   按 ③ 判定（判到 B 但服务不可用 → 退回 A 并标注）
  ├─ ⑤ 跑批 (scheduler.ts)：爬坡 → 限流重排队/收缩 → 超时/取消 → 落位
  └─ ⑥ 渲染 (render.ts) + 结构化值 + 宿主服务(registry.ts)
```

**路由优先级**（T-140）：批次参数 `provider`/`model` > `followSessionModel` > `Config`。

## 4. 对外面（改动必须同步）

| 面 | 位置 | 同步要求 |
| --- | --- | --- |
| 工具参数 schema | `AGENT_SWARM_PARAMETERS` | 加参数要同时改 `parseArgs`（白名单式解构，最容易漏）、`specs` 校验、`index` 接线、契约用例 |
| 工具输出 schema | `AGENT_SWARM_OUTPUT.schema` | **结构化值里可能出现的顶层字段必须在此声明**（`additionalProperties:false` 会让未声明字段整批校验失败）—— 有契约用例守 |
| 宿主服务 | `ctx.provide('agentSwarmRegistry', …)` | 服务名/形状变更要在 README 与消费者处同步；暴露用 try/catch（宿主未提供 `provide` 时静默降级） |
| 观测钩子 | `onBatchStart` / `onItemSettled` / `onBatchEnd` | **同名钩子只能出现一次**（对象字面量后键覆盖前键，踩过） |

## 5. 质量门禁

```bash
pnpm test          # node:test,当前 178 例
pnpm typecheck     # tsc --noEmit
pnpm build         # tsdown → lib/index.js
pnpm pack:check    # 解包 tarball,断言 README/LICENSE/CHANGELOG/lib/skill 在里面
```

CI：Node 22 + 24 矩阵；发布前 `prepublishOnly` 会跑 build + pack:check。

## 6. 已知边界

- 条目只能是字符串或**扁平对象**（不支持嵌套）；
- 路径 A 的子任务**无工具**，需要读文件/跑命令的活必须走路径 B（`auto` 会替你判断）；
- 续跑要求同一父会话谱系；
- 路径 B 下 Config 的 `provider`/`model` **不参与子代理选型**（用 `subagentAgentOptions` 或批次参数）；
- 客户端 GUI 面板**尚未实现**（见仓库 Issue/任务卡；当前用 `progressLog` + `agentSwarmRegistry` 观测）。
