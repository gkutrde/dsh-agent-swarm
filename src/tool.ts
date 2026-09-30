/**
 * 工具入口(T-006)— 注册 \`agent_swarm\` 并编排一次批量调用:校验 → 调度 → 渲染。
 *
 * 契约见 项目文档/03-模块文档-工具入口.md。宿主 \`ctx.tools.register\` 接受
 * \`{name, description, parameters, output:{schema, render}, execute, timeoutMs?}\`;
 * 这里手写等价 definition(**不 import \`@deepseek-ai/dsh-tools\`**,同 T-004 的取舍),
 * 失败靠 execute 抛出、宿主 materialize 成 isError。
 *
 * 注意:宿主 parameters 只接受 JSON Schema 子集(object/array/scalar/enum/oneOf),
 * **不支持 minItems/maxItems** —— 2~128 的上限由 src/specs.ts 的校验承担。
 */
import { createSwarmSpecs, type SwarmArgs, type SwarmItem } from './specs.ts'
import { renderSwarmResults, swarmResultValue, type SwarmValue } from './render.ts'
import { detectPathMode, type PathHint } from './routing.ts'
import { runSwarmBatch, type SwarmLauncher, type SwarmResultEntry, type SwarmTask } from './scheduler.ts'

export const AGENT_SWARM_TOOL_NAME = 'agent_swarm'

// 描述必须与**实际执行路径**一致:路径 A 的子任务是单发 LLM(无工具),路径 B 的是完整
// 宿主 subagent(有工具)。曾经只有一份文案,路径 B 下那句 NO tools 是假话(实测抓到)。
const DESCRIPTION_HEAD = 'Fan one prompt template out over 2-128 items as a batch of parallel one-shot subagents and return a single summarized result block. '
const DESCRIPTION_HEAD_SUBAGENT = 'Fan one prompt template out over 2-128 items as a batch of parallel host subagents and return a single summarized result block. '
const DESCRIPTION_PROACTIVE = 'Use it PROACTIVELY - the user does not need to name it - whenever the same kind of independent work applies to several inputs at once (triage, review, summarize, classify, rewrite or compare N files/sections/topics/rows), or when a cheap first pass should decide what deserves expensive follow-up. '
const DESCRIPTION_ONE_SHOT_CAPABILITY = 'Each subagent is a one-shot LLM call with NO tools, no file access and no follow-up: everything it needs must be in the template (which must contain {{item}}), so ask for a short fixed-field answer. '
const DESCRIPTION_ONE_SHOT_SCOPE = 'Do NOT use it for work that needs tools, file edits, multi-round verification, or for items that depend on each other - hand those to the agent-team subagent tools (spawn_teammate/send_message/team_task_*) instead, optionally after using this tool to triage. '
const DESCRIPTION_SUBAGENT_CAPABILITY = 'Each subagent is a full host subagent WITH tools: it can read files, run commands and take several steps, so a template may ask it to investigate {{item}} itself - still ask for a short, fixed-field answer. '
const DESCRIPTION_SUBAGENT_SCOPE = 'Prefer this over hand-spawning subagents when the same kind of work repeats over several inputs. Do NOT use it for items that depend on each other, or for edits you must keep mutually consistent - hand those to the agent-team tools (spawn_teammate/send_message/team_task_*) instead. '
const DESCRIPTION_RESUME = 'Items may carry a reserved "agent" field naming an existing child session: that item CONTINUES that child instead of starting a new one, and the summary marks it resumed=true. '
const DESCRIPTION_TAIL = 'Rate-limit aware: 429/quota failures are requeued with backoff instead of failing. Invalid arguments start nothing.'

/** 路径 A(默认)的工具描述。 */
export const AGENT_SWARM_DESCRIPTION =
  DESCRIPTION_HEAD + DESCRIPTION_PROACTIVE + DESCRIPTION_ONE_SHOT_CAPABILITY + DESCRIPTION_ONE_SHOT_SCOPE + DESCRIPTION_TAIL

/** T-139:auto 路由的说明句(只在 auto 时拼进描述,不影响既有两种文案的逐字内容)。 */
export const DESCRIPTION_AUTO_ROUTING =
  ' Routing is AUTOMATIC in this deployment: a batch that looks like it needs tools (file paths or URL fields in `items`, or templates that say read/open/run/verify/fetch/check) runs as full subagents WITH tools; anything else runs as a cheap one-shot call. Each result reports which path ran in its structured `path` field, so you do not need to ask.'

export function agentSwarmDescription(options: { subagent?: boolean; continuable?: boolean; auto?: boolean } = {}): string {
  if (options.subagent === true) {
    return (
      DESCRIPTION_HEAD_SUBAGENT +
      DESCRIPTION_PROACTIVE +
      DESCRIPTION_SUBAGENT_CAPABILITY +
      (options.continuable === true ? DESCRIPTION_RESUME : '') +
      (options.auto === true ? DESCRIPTION_AUTO_ROUTING : '') +
      DESCRIPTION_SUBAGENT_SCOPE +
      DESCRIPTION_TAIL
    )
  }
  if (options.auto === true) return AGENT_SWARM_DESCRIPTION + DESCRIPTION_AUTO_ROUTING
  return AGENT_SWARM_DESCRIPTION
}

/** 宿主 JSON Schema 子集(仅本模块用到的关键字)。 */
export interface AgentSwarmJsonSchemaNode {
  type?: string
  description?: string
  properties?: Record<string, AgentSwarmJsonSchemaNode>
  required?: string[]
  additionalProperties?: boolean
  items?: AgentSwarmJsonSchemaNode
  /** 宿主 schema 子集支持 oneOf(与 type 互斥)。 */
  oneOf?: AgentSwarmJsonSchemaNode[]
}

export const AGENT_SWARM_PARAMETERS: AgentSwarmJsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description: {
      type: 'string',
      description: 'Short label for the whole batch; it labels every subagent of this call.',
    },
    prompt_template: {
      type: 'string',
      description:
        'Prompt template applied to every item. Must reference the item: either {{item}} or a field placeholder {{item.<key>}} (object items). Built-ins: {{index}} (1-based position) and {{total}} (item count).',
    },
    items: {
      type: 'array',
      // 两种形态都要声明:只写 string 会让模型永远不用结构化条目(实现自 T-115 起支持对象)。
      items: { oneOf: [{ type: 'string' }, { type: 'object' }] },
      description:
        'One entry per subagent: 2-128 distinct entries. Each entry is either a string (used as {{item}}) or a flat object whose values are strings or numbers (fields are available as {{item.<key>}}, e.g. {"path":"src/a.ts","focus":"perf"}). A reserved key "agent" names an existing child session id: that entry CONTINUES that child instead of starting a new one.',
    },
  },
  // prompt_template 缺失时 specs 会抛 missingTemplate —— 必须是 required,否则模型会踩可预防的错。
  required: ['description', 'prompt_template', 'items'],
}

export interface AgentSwarmContentBlock {
  type: 'text'
  text: string
}

/**
 * 输出契约:对象根(宿主要求 structured output 是 object-rooted),上层可直接取字段
 * (counts/items[].index|outcome|agentId|resumed…),不必正则解析文本。
 * `text` 承载人类可读汇总(与用户看到的逐字一致),render 只读它 —— 格式逻辑只有一份,不会漂移。
 */
export const AGENT_SWARM_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'counts', 'items'],
    properties: {
      text: { type: 'string', description: 'Human-readable summary; identical to what the user sees.' },
      // T-139:自动路由的判定结果。**必须在此声明** —— additionalProperties:false 会让未声明的字段整批校验失败(踩过)。
      path: { type: 'string', description: 'Execution path actually used: llm (one-shot, no tools) | subagent (full subagent with tools).' },
      pathReason: { type: 'string', description: 'Why that path was chosen (e.g. object-item-location-field:path, tool-keyword:读取, default:llm, or a fallback note).' },
      usage: {
        type: 'object',
        additionalProperties: false,
        required: ['inputTokens', 'outputTokens'],
        description: 'Batch token totals (sum over every item and every attempt); absent when the provider reports no usage.',
        properties: {
          inputTokens: { type: 'integer' },
          outputTokens: { type: 'integer' },
          totalTokens: { type: 'integer' },
        },
      },
      counts: {
        type: 'object',
        additionalProperties: false,
        required: ['completed', 'failed', 'aborted'],
        properties: {
          completed: { type: 'integer' },
          failed: { type: 'integer' },
          aborted: { type: 'integer' },
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'item', 'state', 'outcome', 'body'],
          properties: {
            index: { type: 'integer' },
            item: { type: 'string' },
            state: { type: 'string', description: 'Whether the task had been launched when the result settled: started | not_started. This is NOT the current state.' },
            outcome: { type: 'string', description: 'completed | failed | aborted' },
            body: { type: 'string' },
            reason: {
              type: 'string',
              description:
                'Failure cause (failed/aborted only): timeout | empty-output | provider-error | max-tokens | refusal | aborted | attempts-exhausted | deadlock | failed. Use it to decide whether to resume, retry just this item, or hand off.',
            },
            usage: {
              type: 'object',
              additionalProperties: false,
              required: ['inputTokens', 'outputTokens'],
              description: 'Token usage for this item, summed over its attempts.',
              properties: {
                inputTokens: { type: 'integer' },
                outputTokens: { type: 'integer' },
                totalTokens: { type: 'integer' },
              },
            },
            stopReason: { type: 'string' },
            attempts: { type: 'integer' },
            throttled: { type: 'boolean' },
            elapsedMs: { type: 'integer' },
            agentId: { type: 'string', description: 'Subagent session id (path B); use it as an item `agent` key to resume.' },
            resumed: { type: 'boolean' },
            truncated: { type: 'integer' },
          },
        },
      },
    },
  },
  render: (_args: unknown, value: unknown): AgentSwarmContentBlock[] => {
    const text = (value as { text?: unknown } | null | undefined)?.text
    return [{ type: 'text', text: typeof text === 'string' ? text : String(value) }]
  },
}

/** 工具级调用上限:整批(含退避重试)不可能超过 4 小时;单子任务超时由 Config.timeoutMs 管。 */
export const TOOL_TIMEOUT_MS = 4 * 60 * 60 * 1000

export interface AgentSwarmExecContext {
  /** 调用方取消信号(宿主工具运行时提供)。 */
  signal?: AbortSignal
  /** 调用方 agent(路径 B 把它作为 subagent 的 parent)。 */
  agent?: unknown
}

export interface AgentSwarmToolDefinition {
  name: string
  description: string
  parameters: AgentSwarmJsonSchemaNode
  output: typeof AGENT_SWARM_OUTPUT
  timeoutMs: number
  /** 声明并发安全:批内自带并发闸门,可与其他工具并行(宿主据此调度)。 */
  isConcurrencySafe?: () => boolean
  execute(args: unknown, exec: AgentSwarmExecContext): Promise<SwarmValue>
}

/** 执行层选择结果:launcher + 本次实际路径(T-139)。旧的「只返回 launcher」写法仍然兼容。 */
export interface LauncherSelection {
  launcher: SwarmLauncher
  path?: 'llm' | 'subagent'
  pathReason?: string
}

export interface AgentSwarmToolDeps {
  /** 每批新建一个 launcher(生产实现 = createLlmLauncher / createSubagentLauncher;测试注入假 launcher)。
   * 接收工具执行上下文:路径 B 需要 `exec.agent` 作为 `parent`。 */
  createLauncher: (context: AgentSwarmExecContext, hint?: PathHint) => SwarmLauncher | LauncherSelection
  /** 并发硬上限;缺省不限制。 */
  maxConcurrency?: number
  /** 单子任务超时(ms),0 = 不设任务级超时。 */
  timeoutMs: number
  /** 覆盖工具级超时(默认 TOOL_TIMEOUT_MS)。 */
  toolTimeoutMs?: number
  /** 单条正文最大字符数;缺省 = 不截断(A-03 逐字保留)。 */
  maxBodyChars?: number
  /** 首波并发上限;缺省 = 调度器默认 5。 */
  rampLimit?: number
  /** 首波之后的放量间隔(ms);缺省 = 调度器默认 700。 */
  rampIntervalMs?: number
  /** 展开后单条 prompt 的字符上限;缺省 = 不限。 */
  maxPromptChars?: number
  /** 单任务尝试上限(含首次);缺省 = 不设上限。 */
  maxAttempts?: number
  /** 观测钩子:每条结果落位时回调(工具入口用它接进度日志)。 */
  onItemSettled?: (result: SwarmResultEntry) => void
  /** 开跑钩子(T-127):**校验通过、零子任务启动**时回调一次,用于写「开跑预检」日志。 */
  onBatchStart?: (info: {
    count: number
    rampLimit?: number
    rampIntervalMs?: number
    timeoutMs: number
    /** 本次实际路径(T-139);旧调用方可忽略。 */
    path?: 'llm' | 'subagent'
    pathReason?: string
  }) => void
  /** 覆盖工具描述(按执行路径生成,见 agentSwarmDescription)。缺省 = 路径 A 文案。 */
  description?: string
}

function cleanError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** 结构校验:非对象/类型错在启动任何子任务之前就拒绝,文案面向模型可读。 */
function parseArgs(args: unknown): SwarmArgs {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('agent_swarm arguments must be an object.')
  }
  const record = args as Record<string, unknown>
  const { description, prompt_template: template, items } = record
  if (typeof description !== 'string' || description.trim() === '') {
    throw new Error('agent_swarm requires a non-empty description.')
  }
  if (!Array.isArray(items) || !items.every((item) => typeof item === 'string' || (typeof item === 'object' && item !== null && !Array.isArray(item)))) {
    throw new Error('agent_swarm requires items to be an array of strings or flat objects.')
  }
  if (template !== undefined && typeof template !== 'string') {
    throw new Error('agent_swarm requires prompt_template to be a string.')
  }
  return {
    description,
    ...(template === undefined ? {} : { prompt_template: template }),
    items: [...(items as SwarmItem[])],
  }
}

/**
 * 造 \`agent_swarm\` 工具 definition。
 *
 * 一次调用 = 校验展开(零启动保证)→ 组装 tasks(0-based index、Config 超时)→
 * 调度器跑批(exec.signal 即批取消信号)→ 渲染汇总文本。
 */
export function createAgentSwarmTool(deps: AgentSwarmToolDeps): AgentSwarmToolDefinition {
  if (deps.maxBodyChars !== undefined && (!Number.isInteger(deps.maxBodyChars) || deps.maxBodyChars < 1)) {
    throw new Error('agent_swarm maxBodyChars must be a positive integer when set.')
  }
  if (deps.rampLimit !== undefined && (!Number.isInteger(deps.rampLimit) || deps.rampLimit < 1)) {
    throw new Error('agent_swarm rampLimit must be a positive integer when set.')
  }
  if (deps.rampIntervalMs !== undefined && (!Number.isFinite(deps.rampIntervalMs) || deps.rampIntervalMs < 0)) {
    throw new Error('agent_swarm rampIntervalMs must be a non-negative number when set.')
  }
  if (deps.maxPromptChars !== undefined && (!Number.isInteger(deps.maxPromptChars) || deps.maxPromptChars < 1)) {
    throw new Error('agent_swarm maxPromptChars must be a positive integer when set.')
  }
  if (deps.maxAttempts !== undefined && (!Number.isInteger(deps.maxAttempts) || deps.maxAttempts < 1)) {
    throw new Error('agent_swarm maxAttempts must be a positive integer when set.')
  }
  return {
    name: AGENT_SWARM_TOOL_NAME,
    description: deps.description ?? AGENT_SWARM_DESCRIPTION,
    parameters: AGENT_SWARM_PARAMETERS,
    output: AGENT_SWARM_OUTPUT,
    timeoutMs: deps.toolTimeoutMs ?? TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      // ① 解析 + ② 校验展开:任何失败都发生在 createLauncher 之前(零子任务启动)。
      const parsed = parseArgs(args)
      const specs = createSwarmSpecs(parsed, {
        ...(deps.maxPromptChars === undefined ? {} : { maxPromptChars: deps.maxPromptChars }),
      })

      // T-139:把「本次调用看起来是否需要工具」作为判定提示交给执行层(策略在 index:显式配置优先,auto 才用它)。
      const hint = detectPathMode({ items: parsed.items, promptTemplate: parsed.prompt_template ?? '' })
      let launcher: SwarmLauncher
      let selection: { path?: 'llm' | 'subagent'; pathReason?: string } = {}
      try {
        const created = deps.createLauncher(exec ?? {}, hint)
        if (created !== null && typeof created === 'object' && 'launcher' in (created as object)) {
          const picked = created as LauncherSelection
          launcher = picked.launcher
          selection = {
            ...(picked.path === undefined ? {} : { path: picked.path }),
            ...(picked.pathReason === undefined ? {} : { pathReason: picked.pathReason }),
          }
        } else {
          launcher = created as SwarmLauncher
        }
      } catch (error) {
        throw cleanError(error)
      }

      const tasks: SwarmTask[] = specs.map((spec) => ({
        index: spec.index,
        item: spec.item,
        prompt: spec.prompt,
        ...(spec.resumeAgentId === undefined ? {} : { resumeAgentId: spec.resumeAgentId }),
        ...(deps.timeoutMs > 0 ? { timeoutMs: deps.timeoutMs } : {}),
      }))

      // 到这里:前置校验已过、launcher 已建好、**还没有任何子任务启动** —— 正是写开跑预检的时机。
      deps.onBatchStart?.({
        count: tasks.length,
        ...(deps.rampLimit === undefined ? {} : { rampLimit: deps.rampLimit }),
        ...(deps.rampIntervalMs === undefined ? {} : { rampIntervalMs: deps.rampIntervalMs }),
        timeoutMs: deps.timeoutMs,
        ...selection,
      })

      try {
        const results = await runSwarmBatch(tasks, launcher, {
          ...(deps.maxConcurrency === undefined ? {} : { maxConcurrency: deps.maxConcurrency }),
          ...(deps.rampLimit === undefined ? {} : { initialLaunchLimit: deps.rampLimit }),
          ...(deps.rampIntervalMs === undefined ? {} : { initialLaunchIntervalMs: deps.rampIntervalMs }),
          ...(deps.maxAttempts === undefined ? {} : { maxAttempts: deps.maxAttempts }),
          ...(deps.onItemSettled === undefined ? {} : { onItemSettled: deps.onItemSettled }),
          ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
        })
        const text = renderSwarmResults(results, {
          ...(deps.maxBodyChars === undefined ? {} : { maxBodyChars: deps.maxBodyChars }),
        })
        return swarmResultValue(results, text, {
          ...(deps.maxBodyChars === undefined ? {} : { maxBodyChars: deps.maxBodyChars }),
          ...selection,
        })
      } catch (error) {
        throw cleanError(error)
      }
    },
  }
}
