/**
 * dsh-agent-swarm — DeepSeek Harness 插件入口(T-006)。
 *
 * 注册 \`agent_swarm\` 工具:把 \`prompt_template + items\` 展开成一批并行子任务
 * (一期为纯 \`ctx.llm.stream\` 调用,子任务无工具),自带限流退避调度与安全汇总。
 *
 * cordis 契约(name/inject/Config/具名 apply)见 项目文档/03-模块文档-工具入口.md。
 */
import type { Context } from 'cordis'
import z from 'schemastery'
import { createLlmLauncher, resolveAgentRoute, type LlmServiceLike } from './launcher-llm.ts'
import { createSubagentLauncher, resolveSubagentService, type SubagentServiceLike } from './launcher-subagent.ts'
import {
  createContinuableSubagentLauncher,
  resolveHostService,
  type AgentLookupLike,
  type SessionQueryLike,
} from './launcher-continuable.ts'
import { formatResultLine } from './render.ts'
import { SwarmRegistry } from './registry.ts'
import { agentSwarmDescription, createAgentSwarmTool } from './tool.ts'

export const name = 'dsh-agent-swarm'

/** 只依赖工具注册表与 llm 服务;两者都在宿主 base 层。 */
export const inject = ['tools', 'llm']

export interface Config {
  /** Hard cap on concurrent subagent runs. Absent = unlimited. */
  maxConcurrency?: number
  /** Per-subtask timeout in ms; 0 = no per-task timeout. Defaults to 7200000 (2h). */
  timeoutMs: number
  /** Provider route used for every subtask. Defaults to the harness default route. */
  provider: string
  /** Model id used for every subtask. Defaults to the harness default model. */
  model: string
  /** Optional maxTokens for each subtask request. */
  maxTokens?: number
  /** Cap on each result body in the summary, in characters. Absent = keep every body verbatim. */
  maxBodyChars?: number
  /** First-wave concurrency. Absent = scheduler default (5). */
  rampLimit?: number
  /** Interval between launches after the first wave, in ms. Absent = scheduler default (700). */
  rampIntervalMs?: number
  /** Host failure codes that requeue a subtask instead of failing it. Defaults to RATE_LIMIT/QUOTA. */
  retryableFailureCodes?: string[]
  /** Character cap for one expanded subtask prompt. Absent = no cap. */
  maxPromptChars?: number
  /** Attempt budget per subtask (first attempt included). Absent = unbounded retries. */
  maxAttempts?: number
  /** Backoff jitter ceiling in ms. Absent/0 = no jitter (blueprint behaviour). */
  backoffJitterMs?: number
  /** Tool-call ceiling for one batch. Absent = 4h. */
  toolTimeoutMs?: number
  /** System prompt for every subtask. Absent = built-in subagent prompt. */
  systemPrompt?: string
  /** Log each settled subtask as it finishes (long batches become observable). Default off. */
  progressLog?: boolean
  /** T-141: how many finished batches the status registry keeps (default 5). */
  registryHistoryLimit?: number
  /** Path B: run subtasks as host subagents through this provider name (e.g. 'spawn'). Absent = path A (one-shot LLM). */
  subagentProvider?: string
  /** Let subtasks follow the calling agent's own provider/model instead of the plugin Config. Default off. */
  followSessionModel?: boolean
  /** Path B only: run subtasks as *continuable* children so they can be resumed via an item's reserved `agent` key. Default off. */
  resumeEnabled?: boolean
  /** Path B only: pass Config's provider/model/maxTokens to each child as host AgentOptions (needs provider support). Default off = inherit the caller's route. */
  subagentAgentOptions?: boolean
  /** Path B only: per-turn wait ceiling in ms; 0 = no ceiling. Defaults to timeoutMs so it never fires before the task timeout. */
  subagentTurnTimeoutMs?: number
  /** Path B only: status/session poll interval in ms. Defaults to 500. */
  subagentPollIntervalMs?: number
}

export const Config = z.object({
  maxConcurrency: z.number().min(1),
  timeoutMs: z.number().min(0).default(7_200_000),
  provider: z.string().default('deepseek-official'),
  model: z.string().default('deepseek-flash'),
  maxTokens: z.number().min(1),
  maxBodyChars: z.number().min(1),
  rampLimit: z.number().min(1),
  rampIntervalMs: z.number().min(0),
  // 必须给非空默认值:schemastery 把未配置的 z.array() 解析成 []，而空码表会被
  // launcher 的严格校验拒绝 → 默认配置下每次调用都会失败(见 test/config-wiring.test.ts)。
  retryableFailureCodes: z.array(z.string()).default(['RATE_LIMIT', 'QUOTA']),
  maxPromptChars: z.number().min(1),
  maxAttempts: z.number().min(1),
  backoffJitterMs: z.number().min(0),
  toolTimeoutMs: z.number().min(1),
  systemPrompt: z.string(),
  progressLog: z.boolean().default(false),
  /** T-141:批次状态注册表保留的历史批次数(默认 5)。 */
  registryHistoryLimit: z.natural().default(5),
  subagentProvider: z.string(),
  followSessionModel: z.boolean().default(false),
  resumeEnabled: z.boolean().default(false),
  subagentAgentOptions: z.boolean().default(false),
  subagentTurnTimeoutMs: z.number().min(0),
  subagentPollIntervalMs: z.number().min(1),
})

/**
 * 把服务暴露给宿主(T-141)。
 * 必须**安全访问**:cordis 对未声明属性会抛错(Proxy 守卫用例覆盖),宿主版本差异也可能没有 provide。
 * 暴露失败只意味着别的插件查不到注册表,绝不影响本插件装载与批处理。
 */
function provideService(ctx: unknown, name: string, value: unknown): void {
  try {
    const provide = (ctx as { provide?: (serviceName: string, serviceValue: unknown) => unknown } | undefined)?.provide
    if (typeof provide === 'function') provide.call(ctx, name, value)
  } catch {
    /* 宿主不提供该能力:静默降级 */
  }
}

/** 宿主注入的服务(结构化声明,不 import \`@deepseek-ai/*\`)。 */
interface SwarmServices {
  tools: { register(definition: unknown): () => void }
  llm: LlmServiceLike
}

export function apply(ctx: Context, config: Config): void {
  const app = ctx as Context & SwarmServices
  // subagent 服务按需查找:**不能直接读 ctx.subagents** —— cordis 对未 inject 的服务属性访问会抛
  // `cannot get property "subagents" without inject`(实测踩到)。用 ctx.get() 做可选查找,
  // 这样未启用路径 B 的 profile 不因缺该服务而装载失败。
  const subagents = (ctx as { get?: (name: string) => unknown }).get?.('subagents') as SubagentServiceLike | undefined
  // T-141:批次状态注册表 —— 暴露成宿主服务,供其它插件/UI 查询(纯内存、有界)。
  const registry = new SwarmRegistry({
    ...(config.registryHistoryLimit === undefined ? {} : { historyLimit: config.registryHistoryLimit }),
  })
  ctx.effect(() => {
    provideService(ctx, 'agentSwarmRegistry', registry)
    const tool = createAgentSwarmTool({
      createLauncher: (exec, request) => {
        const hint = request?.hint
        // 路径 B 的服务必须在**调用点**从 agent 作用域解析(插件自身 ctx 看不到兄弟作用域注册的服务)。
        const subagentService = resolveSubagentService(exec.agent, subagents)
        const configured = (config.subagentProvider ?? '').trim()
        const auto = configured.toLowerCase() === 'auto'
        // auto 只是**策略**;真正传给宿主的必须是已注册的提供方名。默认 spawn(宿主 base bundle 自带)。
        const subagentProviderName = auto ? 'spawn' : configured
        // T-139:auto = 按每次调用的提示判定;显式提供方名 = 固定路径 B;空 = 固定路径 A(默认,行为不变)。
        const wantSubagent = auto ? hint?.mode === 'subagent' : configured !== ''
        if (!auto && wantSubagent && subagentService === undefined) {
          throw new Error('agent_swarm subagentProvider is set but the subagents service is unavailable in this scope.')
        }
        // auto 判到 B 但服务不可用 -> 退回 A 并标注(绝不因路由而整批失败)。
        const useSubagent = wantSubagent && subagentService !== undefined
        const path: 'llm' | 'subagent' = useSubagent ? 'subagent' : 'llm'
        const pathReason = auto
          ? (hint?.reason ?? 'auto') + (wantSubagent && !useSubagent ? ' -> fallback:llm:subagents-unavailable' : '')
          : (useSubagent ? 'configured:subagentProvider' : 'default:llm')
        // 跟随会话模型:只有显式开启才覆盖 Config 的 provider/model。
        const sessionRoute = config.followSessionModel === true ? resolveAgentRoute(exec.agent) : undefined
        // T-140 优先级:批次参数 > followSessionModel > 配置。
        const provider = request?.provider ?? sessionRoute?.provider ?? config.provider
        const model = request?.model ?? sessionRoute?.model ?? config.model
        // 路径 B 的路由覆盖:显式开关才传(默认继承父 agent 路由;提供方不支持该能力时会以失败回报)。
        const perCallRoute = request?.provider !== undefined || request?.model !== undefined
        const agentOptions =
          config.subagentAgentOptions === true || perCallRoute
            ? { provider, model, ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }) }
            : undefined
        const turnTimeoutMs = config.subagentTurnTimeoutMs ?? config.timeoutMs
        const pollIntervalMs = config.subagentPollIntervalMs
        const retryCodes =
          config.retryableFailureCodes === undefined || config.retryableFailureCodes.length === 0
            ? {}
            : { retryableFailureCodes: config.retryableFailureCodes }
        const useContinuable = useSubagent && config.resumeEnabled === true
        if (useContinuable) {
          const sessions = resolveHostService<SessionQueryLike>(exec.agent, 'sessionQuery')
          if (sessions === undefined) {
            throw new Error('agent_swarm resumeEnabled is set but ctx.sessionQuery is unavailable in this scope.')
          }
          const agentLookup = resolveHostService<AgentLookupLike>(exec.agent, 'agents')
          return { launcher: createContinuableSubagentLauncher({
            subagents: subagentService as never,
            sessions,
            ...(agentLookup === undefined ? {} : { agents: agentLookup }),
            provider: subagentProviderName,
            parent: exec.agent,
            turnTimeoutMs,
            ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
            ...(agentOptions === undefined ? {} : { agentOptions }),
          }), path, pathReason }
        }
        return useSubagent
          ? { launcher: createSubagentLauncher({
              subagents: subagentService as SubagentServiceLike,
              provider: subagentProviderName,
              parent: exec.agent,
              ...(agentOptions === undefined ? {} : { agentOptions }),
              ...retryCodes,
            }), path, pathReason }
          : { launcher: createLlmLauncher({
              llm: app.llm,
              provider,
              model,
              ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
              ...retryCodes,
              ...(config.systemPrompt === undefined ? {} : { systemPrompt: config.systemPrompt }),
            }), path, pathReason }
      },
      ...(config.maxConcurrency === undefined ? {} : { maxConcurrency: config.maxConcurrency }),
      ...(config.maxBodyChars === undefined ? {} : { maxBodyChars: config.maxBodyChars }),
      ...(config.rampLimit === undefined ? {} : { rampLimit: config.rampLimit }),
      ...(config.rampIntervalMs === undefined ? {} : { rampIntervalMs: config.rampIntervalMs }),
      ...(config.maxPromptChars === undefined ? {} : { maxPromptChars: config.maxPromptChars }),
      ...(config.maxAttempts === undefined ? {} : { maxAttempts: config.maxAttempts }),
      ...(config.backoffJitterMs === undefined ? {} : { rateLimitBackoffJitterMs: config.backoffJitterMs }),
      ...(config.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: config.toolTimeoutMs }),
      // 观测接线(T-141 注册表随时喂;progressLog 开时在**同一个钩子**里再写日志 —— 分成两个同名键会互相覆盖,踩过)。
      onBatchStart: (info: {
        description?: string
        count: number
        rampLimit?: number
        rampIntervalMs?: number
        timeoutMs: number
        path?: 'llm' | 'subagent'
      }) => {
        try {
          registry.begin({
            description: info.description ?? '',
            ...(info.path === undefined ? {} : { path: info.path }),
            count: info.count,
          })
        } catch {
          /* 观测面失败不影响批 */
        }
        if (config.progressLog !== true) return
        ctx.logger?.info?.(
          `[dsh-agent-swarm] starting ${info.count} subtasks (first wave ${info.rampLimit ?? 5}, +1 every ${info.rampIntervalMs ?? 700}ms, per-task timeout ${info.timeoutMs}ms)`,
          { count: info.count, rampLimit: info.rampLimit, rampIntervalMs: info.rampIntervalMs, timeoutMs: info.timeoutMs },
        )
      },
      onItemSettled: (entry: unknown) => {
        const settled = entry as {
          task: { index: number; item: string; resumeAgentId?: string }
          status: string
          state: string
          reason?: string
          agentId?: string
          elapsedMs?: number
          attempts?: number
          throttled?: boolean
        }
        try {
          registry.settle({
            index: settled.task.index,
            item: String(settled.task.item),
            state: settled.state,
            outcome: settled.status,
            ...(settled.reason === undefined ? {} : { reason: settled.reason }),
            ...(settled.agentId === undefined ? {} : { agentId: settled.agentId }),
            ...(settled.elapsedMs === undefined ? {} : { elapsedMs: settled.elapsedMs }),
          })
        } catch {
          /* 观测面失败不影响批 */
        }
        if (config.progressLog !== true) return
        ctx.logger?.info?.('[dsh-agent-swarm] ' + formatResultLine(settled as never), {
          index: settled.task.index,
          outcome: settled.status,
          state: settled.state,
          ...(settled.attempts === undefined ? {} : { attempts: settled.attempts }),
          ...(settled.throttled === true ? { throttled: true } : {}),
          ...(settled.elapsedMs === undefined ? {} : { elapsedMs: settled.elapsedMs }),
          ...(settled.agentId === undefined ? {} : { agentId: settled.agentId }),
          ...(settled.task.resumeAgentId === undefined ? {} : { resumed: true }),
        })
      },
      onBatchEnd: () => {
        try {
          registry.finish({})
        } catch {
          /* 观测面失败不影响批 */
        }
      },
      description: agentSwarmDescription({
        // auto:描述说明「路由是自动的」;显式提供方名:描述切到路径 B 文案(逐字不变)。
        subagent: !((config.subagentProvider ?? '').trim().toLowerCase() === 'auto') && (config.subagentProvider ?? '').trim() !== '',
        continuable: config.resumeEnabled === true,
        auto: (config.subagentProvider ?? '').trim().toLowerCase() === 'auto',
      }),
      timeoutMs: config.timeoutMs,
    })
    const dispose = app.tools.register(tool)
    ctx.logger?.info?.(
      `[dsh-agent-swarm] registered tool "${tool.name}" (provider=${config.provider}, model=${config.model}, ` +
        `maxConcurrency=${config.maxConcurrency ?? 'unlimited'}, timeoutMs=${config.timeoutMs})`,
    )
    return () => {
      try {
        dispose()
      } catch {
        /* 注册已随 ctx 一起回收 */
      }
    }
  })
}

// NOTE: no \`export default\` here — cordis loader's unwrapExports() collapses
// \`exports.default ?? exports\`, so a default export would hide the module-level
// `name`/`inject`/`Config` exports (a default export would hide them). Named exports only.
