# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 测试

- 补齐 `src/index.ts` 的配置接线直接覆盖（此前是唯一无测试的模块）：描述按路径分支、`progressLog` 的开跑预检与落位钩子、路径 B / 续跑选路、`subagentAgentOptions` 组装，共 5 例。

### 修复

- **失败原因只在路径 A 覆盖**：路径 B 与续跑 launcher 的 `onError` 基本不带 `reason`，于是这两条路径的失败会退化成调度器兜底的 `failed`（续跑轮超时本该是 `timeout`）。现三条路径统一上报：`empty-output` / `aborted` / `max-tokens` / `refusal` / `provider-error` / `timeout` / `failed`。
- **续跑的「空产出」分支是死代码**：会话读取会跳过正文为空的消息且不推进序号，导致该分支永不可达 —— 续跑遇空产出会一直等到轮超时才报 `timeout`（原因误导且白等）。现改为「最新一条助手消息即本轮产出」，空产出即时正确地报 `empty-output`。
- **对外声明与实现对不齐（三处）**：`prompt_template` 实际必需却未列入 `required`；`reason` 的字段描述只列 6 个取值（实际 9 个，`max-tokens`/`refusal`/`failed` 缺失）；`state` 没有任何说明，导致模型把它误读成「当前状态」（实为「落位时是否启动过：started / not_started」）。现三者均已对齐。
- **截断可能切碎代理对**：`maxBodyChars` 截断与路径 B 的子会话 `label` 都按 UTF-16 码元截取，若切点落在 emoji 等代理对中间会留下**孤代理**（非法文本，可能污染 JSON/渲染）。现按码点边界回退一位（`sliceAtCodePoint`），截断计数按实际保留长度计算。
- **参数声明与实现对不齐**：`items` 此前声明为「字符串数组」，而实现自 0.5.0 起支持对象条目 —— 模型只被告知能传字符串，于是**结构化条目对模型不可见**。现用 `oneOf` 同时声明字符串与对象，并在描述里写明字段占位符 `{{item.<key>}}`、内置 `{{index}}`/`{{total}}` 与续跑保留键 `agent`。
- 用量口径统一：`totalTokens` 只在出现过时才带上（不再由单侧臆造）；批次合计首次遇到 `totalTokens` 时以此前累加的 input/output 为基线，避免漏算前面的条目。
- `cordis.patch.yml` 的配置注释补齐 3 个路径 B 开关（`subagentAgentOptions` / `subagentTurnTimeoutMs` / `subagentPollIntervalMs`），与 `src/index.ts` 的 Config 键集合完全一致。
- README 不再硬编码用例数（此前两处数字互相矛盾且过期），改由 CI 徽标表达。

## [0.5.2] - 2026-09-30

### 新增

- **开跑预检日志**：启用 `progressLog` 时，批量在**校验通过、零子任务启动**的那一刻先写一行 `starting N subtasks (first wave X, +1 every Yms, per-task timeout Zms)`，再开始逐条落位日志；`progressLog=false`（默认）不写任何日志。
- **token 用量统计**：采集宿主 `usage` chunk，按条目跨尝试累加并给出整批合计，放进工具的结构化返回值（`usage: { inputTokens, outputTokens, totalTokens? }`）；provider 不给用量时字段缺席。**人读汇总保持逐字不变**。
- **失败原因分类 `reason`**：失败条目不再只有笼统的 `failed`，而是带机器可判的原因（`timeout` / `empty-output` / `provider-error` / `max-tokens` / `aborted` / `attempts-exhausted` / `deadlock`），人读汇总输出 `reason=`，结构化值的 item 也带该字段——上层可据此自动决定续跑、重跑该条还是降级给队友。
- 模板内置变量 `{{index}}`（1-based 序位）与 `{{total}}`（条目总数），便于在模板里表达"第 3/10 项"。
- **结构化输出**：工具返回值改为对象根（`text` + `counts` + `items[]`，含 `agentId`/`resumed`/`truncated` 等字段），上层可直接取字段而不必正则解析文本行；`text` 仍是用户看到的那份汇总，逐字不变。
- 技能 `swarm-then-team` 重写：**两条执行路径分叉**（路径 A 禁工具类任务、路径 B 允许并要求显式工具指令）、新增**续跑未完成项**阶段、**失败处理三条路**、**交叉核对硬要求**、成本量化。

## [0.5.1] - 2026-09-30

### 修复

- **打包产物缺少 README 与 LICENSE**：`files` 显式列入两者，并新增 `pnpm pack:check` 断言（CI 每次跑），防止再发出去一个没有许可证声明的包。
- **续跑的轮超时可能早于任务超时触发**：轮询上限原本硬编码 10 分钟，而调度器 per-task 超时默认 2 小时 → 慢子代理会被提前判失败。现默认与 `timeoutMs` 对齐，并可用 `subagentTurnTimeoutMs` 覆盖（`0` = 不设上限）。

### 变更

- 续跑轮询改为**状态优先**：有 `agents` 状态面时，子级 `running` 期间**完全不读会话**（长子会话的整份读是 O(n²)），仅在 `idle` 时读一次。
- 新增 `subagentAgentOptions`（默认关）：路径 B 可把 Config 的 `provider`/`model`/`maxTokens` 作为宿主 `AgentOptions` 传给子代理（需提供方支持该能力）。
- 新增 `subagentPollIntervalMs`（默认 500）。
- `progressLog` 除文本行外，同时把结构化字段交给 `ctx.logger`。

### 工程

- GitHub Actions CI（Node 20 / 22 矩阵：typecheck → test → build → 打包断言）。
- 新增 `CONTRIBUTING.md`、Issue / PR 模板。

## [0.5.0] - 2026-09-30

### 新增

- **路径 B**（`subagentProvider`）：子任务作为宿主 subagent 运行 —— 带工具、可多轮（真实宿主实测：子代理读文件后作答）。
- **续跑**（`resumeEnabled` + 条目保留键 `agent`）：同一子会话接力，汇总标 `resumed=true`；单条目续跑合法。
- **模型跟随会话**（`followSessionModel`）。
- 子会话 id 透出：元数据行 `agent=<子会话 id>`，回执可追溯。
- 开源：MIT、README、Release 附件。

### 修复

- 空 config 下 `retryableFailureCodes` 被解析为空数组，导致默认配置下每次调用都失败。

## [0.4.0] 及更早

- 结构化 items（对象条目 + `{{item.<key>}}` 字段占位符）、缺字段/形状非法前置报错。
- 批内进度观测（`progressLog`）、按诊断文本判定的重排队码表可配。
- 输入硬化：空白项校验、展开后 prompt 长度上限（`maxPromptChars`）、重复子任务检测、单任务尝试预算（`maxAttempts`）、退避抖动（`backoffJitterMs`，默认无抖动）。
- 一期：调度器移植（首波 5 / 700ms 放量、3s×2ⁿ 退避、限流重排队、死锁防护、超时钳位）、七道前置校验、动态围栏安全汇总。
