/**
 * 子代理执行层 · 路径 B(T-102)— 用宿主 subagent 服务跑单个子任务。
 *
 * 与路径 A(`launcher-llm.ts`)的差别:子任务**是一个完整 agent**(有工具、能多轮),
 * 由宿主 `ctx.subagents` 的命名提供方(spawn/fork/…)创建;resume 属二期 T-103。
 *
 * 契约取自 `@deepseek-ai/dsh-subagent` 的类型声明(结构化声明,不 import):
 * - `start(name, request): Promise<SubagentRun>`(index.d.ts L296)
 * - `SubagentStartRequest = { prompt, parent, signal, label?, agentOptions?, outputSchema?, maxDepth? }`(types.d.ts L136)
 * - `SubagentRun = { id, localAgent?, result, dispose() }`(L292)
 * - `SubagentResult = { output, structured?, diagnostic?, stopReason }`,stopReason ∈ completed|aborted|error|max-tokens|refusal(L239/L256)
 *
 * 映射规则:completed → onComplete(output 文本);aborted → 照常 onError(批取消由调度器丢弃、
 * 任务超时由调度器改写);error/max-tokens/refusal → 非限流 onError(diagnostic 作文案);
 * error 的 diagnostic 命中限流特征 → rateLimit:true 交调度器重排队。
 */
import {
  DEFAULT_RETRYABLE_FAILURE_CODES,
  EMPTY_RESULT_MESSAGE,
  MAX_TOKENS_MESSAGE,
  isRetryableFailure,
} from './launcher-llm.ts'
import { sliceAtCodePoint } from './render.ts'
import type { AttemptCallbacks, SwarmLauncher, SwarmTask } from './scheduler.ts'

export const SUBAGENT_ABORTED_MESSAGE = 'Subagent run was aborted.'
export const SUBAGENT_REFUSAL_MESSAGE = 'Subagent declined the task.'
export const SUBAGENT_FAILED_MESSAGE = 'Subagent failed without a diagnostic.'

export interface ContentBlockLike {
  type: string
  text?: string
}

export interface SubagentResultLike {
  readonly output: ContentBlockLike[]
  readonly structured?: unknown
  readonly diagnostic?: string
  readonly stopReason: string
}

export interface SubagentRunLike {
  readonly id: string
  readonly result: Promise<SubagentResultLike>
  dispose(): Promise<void> | void
}

export interface SubagentStartRequestLike {
  prompt: Array<{ type: 'text'; text: string }>
  parent: unknown
  signal: AbortSignal
  label?: string
  /** 宿主 AgentOptions 覆盖(provider/model/reasoningEffort/maxTokens);需提供方支持该能力。 */
  agentOptions?: Record<string, unknown>
}

export interface SubagentServiceLike {
  start(provider: string, request: SubagentStartRequestLike): Promise<SubagentRunLike>
}

/**
 * 在**调用点**解析 subagent 服务。插件自己的 ctx 看不到兄弟作用域注册的服务
 * (cordis 对未 inject 的服务属性访问会直接抛错),而工具 exec 带来的 agent 有自己的作用域
 * ctx(宿主 Agent.ctx),在那里 get('subagents') 才拿得到。取不到就回退 fallback。
 */
export function resolveSubagentService(
  agent: unknown,
  fallback?: SubagentServiceLike,
): SubagentServiceLike | undefined {
  const agentCtx = (agent as { ctx?: { get?: (name: string) => unknown } } | undefined)?.ctx
  try {
    const found = agentCtx?.get?.('subagents')
    if (found !== undefined && found !== null) return found as SubagentServiceLike
  } catch {
    /* 作用域不可见:回退 */
  }
  return fallback
}

export interface SubagentLauncherOptions {
  subagents: SubagentServiceLike
  /** 提供方名(如 spawn/fork);由 Config 指定,缺省走路径 A 不启用本模块。 */
  provider: string
  /** 调用方 agent(工具 exec.agent):提供方从它的持久会话状态派生工作区/血缘/深度。 */
  parent: unknown
  /** 覆盖默认可重排队码表(用于 diagnostic 文本启发式)。 */
  retryableFailureCodes?: readonly string[]
  /** 传给子级的宿主 AgentOptions(provider/model/…);缺省 = 继承父 agent 路由。 */
  agentOptions?: Record<string, unknown>
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return String(value)
}

function textOf(output: readonly ContentBlockLike[]): string {
  return output
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
    .trim()
}

/**
 * 造一个走宿主 subagent 的 launcher。语义与路径 A 对齐(ready/complete/error/abandoned),
 * 因此调度器完全无需改动。
 */
export function createSubagentLauncher(options: SubagentLauncherOptions): SwarmLauncher {
  if (typeof options.provider !== 'string' || options.provider.trim() === '') {
    throw new Error('agent_swarm subagentProvider must be a non-empty provider name.')
  }
  const codes = options.retryableFailureCodes ?? DEFAULT_RETRYABLE_FAILURE_CODES
  const inFlight = new Map<number, SubagentRunLike>()
  const disposed = new Set<SubagentRunLike>()

  const release = (run: SubagentRunLike): void => {
    if (disposed.has(run)) return
    disposed.add(run)
    try {
      void run.dispose()
    } catch {
      /* 释放失败不影响收尾 */
    }
  }

  const settle = (callbacks: AttemptCallbacks, result: SubagentResultLike, run: SubagentRunLike): void => {
    release(run)
    const diagnostic = result.diagnostic
    switch (result.stopReason) {
      case 'completed': {
        const text = textOf(result.output)
        if (text === '') {
          callbacks.onError({ message: EMPTY_RESULT_MESSAGE, rateLimit: false, ready: true, reason: 'empty-output' })
          return
        }
        callbacks.onComplete({ result: text, stopReason: 'completed' })
        return
      }
      case 'aborted':
        callbacks.onError({ message: diagnostic ?? SUBAGENT_ABORTED_MESSAGE, rateLimit: false, ready: true, reason: 'aborted' })
        return
      case 'max-tokens':
        callbacks.onError({ message: diagnostic ?? MAX_TOKENS_MESSAGE, rateLimit: false, ready: true, reason: 'max-tokens' })
        return
      case 'refusal':
        callbacks.onError({ message: diagnostic ?? SUBAGENT_REFUSAL_MESSAGE, rateLimit: false, ready: true, reason: 'refusal' })
        return
      default:
        callbacks.onError({
          message: diagnostic ?? SUBAGENT_FAILED_MESSAGE,
          // 路径 B 只有 diagnostic 文本可用:命中限流特征才重排队,否则按普通失败。
          rateLimit: isRetryableFailure(typeof diagnostic === 'string' ? { message: diagnostic } : undefined, codes),
          ready: true,
          reason: 'failed',
        })
        return
    }
  }

  async function runAttempt(task: SwarmTask, callbacks: AttemptCallbacks, signal: AbortSignal): Promise<void> {
    let run: SubagentRunLike
    try {
      run = await options.subagents.start(options.provider, {
        prompt: [{ type: 'text', text: task.prompt }],
        parent: options.parent,
        signal,
        label: sliceAtCodePoint(task.item, 60),
        ...(options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions }),
      })
    } catch (error) {
      // 子级尚未发布:ready=false(调度器按重罚处理,若确属限流)。
      callbacks.onError({ message: messageOf(error), rateLimit: isRetryableFailure(error, codes), ready: false, reason: 'provider-error' })
      return
    }
    inFlight.set(task.index, run)
    // 子会话已发布:先上报 id(供回执追溯/二期 resume),再报 ready。
    callbacks.onAgent?.(run.id)
    callbacks.onReady()
    let result: SubagentResultLike
    try {
      result = await run.result
    } catch (error) {
      release(run)
      callbacks.onError({ message: messageOf(error), rateLimit: isRetryableFailure(error, codes), ready: true, reason: 'provider-error' })
      return
    } finally {
      if (inFlight.get(task.index) === run) inFlight.delete(task.index)
    }
    settle(callbacks, result, run)
  }

  return {
    start(task, callbacks, signal) {
      void runAttempt(task, callbacks, signal).catch((error: unknown) => {
        try {
          callbacks.onError({ message: messageOf(error), rateLimit: false, ready: true, reason: 'provider-error' })
        } catch {
          /* 调度器已收尾 */
        }
      })
    },
    abandoned(info) {
      const run = inFlight.get(info.task.index)
      if (run === undefined) return
      inFlight.delete(info.task.index)
      release(run)
    },
  }
}
