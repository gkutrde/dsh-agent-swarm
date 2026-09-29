/**
 * 子代理执行层 · 路径 A(T-004)— 用宿主 \`llm.stream\` 跑单个子任务(一期子任务无工具)。
 *
 * 契约见 项目文档/03-模块文档-子代理执行层.md;调度器 launcher 接口见 src/scheduler.ts。
 *
 * 与宿主的耦合方式:不 import \`@deepseek-ai/dsh-llm\`,而是按结构化(鸭子类型)声明其
 * 流协议 —— 字段名取自该包 0.1.5-rc.3 的类型声明(\`StreamChunk\`/\`LlmFailure\`/\`GenerateOptions\`)
 * 并与 dsh-llm-verifier 的生产用法交叉核对。理由与风险见模块文档「宿主契约的耦合方式」。
 *
 * 宿主协议要点(已核实):
 * - \`stream(options: GenerateOptions): AsyncIterable<StreamChunk>\`;文本经 \`text-delta\` 增量下发,
 *   也可能只在 \`block-end\` 带整块文本(两种都要吃)。
 * - 适配器抛出的失败会被 \`LlmRuntime.stream\` 归一化成终态 \`finish\` 块
 *   (\`kind:'error'|'aborted'\` + \`failure:{message, code, status?}\`),而不是抛给调用方;同步抛仍可能出现。
 * - 限流用稳定码 \`RATE_LIMIT\`;账号配额 \`QUOTA\`。判定表见模块文档 §5。
 */
import { randomUUID } from 'node:crypto'
import type { AttemptCallbacks, SwarmLauncher, SwarmTask } from './scheduler.ts'

export const PLUGIN_NAME = 'dsh-agent-swarm'

/** 子任务 system 提示:一次性、单轮、只交结论。 */
export const DEFAULT_SUBAGENT_SYSTEM_PROMPT =
  '你是 dsh agent_swarm 派发的子代理,只负责完成用户消息里的这一项子任务。' +
  '直接给出结论或结果,不要寒暄、不要追问、不要调用工具。'

export const EMPTY_RESULT_MESSAGE = 'Subagent completed without a final message.'
export const MAX_TOKENS_MESSAGE = 'Subagent response reached the max token limit before completing.'
export const ABORTED_RESULT_MESSAGE = 'Subagent run was aborted.'

// ─── 宿主 llm 服务的结构化契约(只声明本模块用到的部分) ───

export interface LlmFailureLike {
  message: string
  /** 稳定机器可路由码,如 RATE_LIMIT / QUOTA / AUTH(宿主 HarnessError.code 体系)。 */
  code: string
  /** 提供商返回的 HTTP 状态码(如果有)。 */
  status?: number
  providerRetryAfterMs?: number
}

export interface LlmFinishReasonLike {
  kind: string
  failure?: LlmFailureLike
}

export interface LlmContentBlockLike {
  type: string
  text?: string
  [key: string]: unknown
}

export interface LlmMessageLike {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: LlmContentBlockLike[]
  source: { kind: string; [key: string]: unknown }
}

export type LlmStreamChunk =
  | { type: 'block-start'; index: number; blockType: string }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: LlmContentBlockLike }
  | { type: 'usage'; usage: unknown }
  | { type: 'finish'; reason: LlmFinishReasonLike }

export interface LlmGenerateOptionsLike {
  provider: string
  model: string
  messages: LlmMessageLike[]
  /** 一次性调用的 system 槽位(宿主 mapped 到 provider 的 system 位置)。 */
  system?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface LlmServiceLike {
  stream(options: LlmGenerateOptionsLike): AsyncIterable<LlmStreamChunk>
}

export interface LlmLauncherOptions {
  llm: LlmServiceLike
  provider: string
  model: string
  /** 覆盖默认子任务 system 提示。 */
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  /** 触发“挂起重排队”的宿主稳定码;默认 RATE_LIMIT/QUOTA。给了就整体替换默认集合。 */
  retryableFailureCodes?: readonly string[]
}

// ─── 限流判定 ───

/** 默认可重排队(挂起重试)的稳定码:限流与配额。 */
export const DEFAULT_RETRYABLE_FAILURE_CODES: readonly string[] = Object.freeze(['RATE_LIMIT', 'QUOTA'])
/** 文案兜底特征:只在拿不到结构化码/状态时使用(保守,避免把普通错误当限流无限重排队)。 */
const RATE_LIMIT_MESSAGE = /rate[ _-]?limit|too many requests|\b429\b|quota|overloaded|限流|配额/i

/**
 * 判定一个失败是否属于“限流/配额”。
 *
 * 只有拿到**明确证据**才返回 true(稳定码 RATE_LIMIT/QUOTA、HTTP 429、或保守的限流文案特征);
 * 其余一律 false —— 按非限流判 failed(见模块文档 §3 警告:反向误判代价更高)。
 * 会沿 \`cause\` 链与 \`response.status\` 找证据,最多 3 层。
 */
/**
 * 从调用方 agent 读出它当前使用的路由(宿主 dsh-agent 的 AgentOptions: { provider?, model? })。
 * Config 未显式指定时可用它让子任务跟随会话模型;形状不符返回 undefined(不猜字段名)。
 */
export function resolveAgentRoute(agent: unknown): { provider: string; model: string } | undefined {
  const options = (agent as { options?: { provider?: unknown; model?: unknown } } | undefined)?.options
  if (options === undefined || options === null || typeof options !== 'object') return undefined
  const provider = options.provider
  const model = options.model
  if (typeof provider !== 'string' || provider.trim() === '') return undefined
  if (typeof model !== 'string' || model.trim() === '') return undefined
  return { provider, model }
}

export function isRateLimitError(value: unknown): boolean {
  return isRetryableFailure(value, DEFAULT_RETRYABLE_FAILURE_CODES)
}

/**
 * 判定一个失败是否应“挂起重排队”。除 \`codes\` 给出的稳定码外,HTTP 429 与保守文案特征
 * 始终算数(它们是 provider 侧的直接证据,与码表无关)。
 */
export function isRetryableFailure(value: unknown, codes: readonly string[]): boolean {
  const normalized = new Set(codes.map((code) => code.toUpperCase()))
  return inspectFailure(value, 0, normalized)
}

function inspectFailure(value: unknown, depth: number, codes: Set<string>): boolean {
  if (depth > 3 || value === null || value === undefined) return false
  // 裸字符串不做推断(避免把日志行当证据)。
  if (typeof value !== 'object') return false
  const record = value as Record<string, unknown>

  const code = typeof record.code === 'string' ? record.code.toUpperCase() : undefined
  if (code !== undefined && codes.has(code)) return true

  for (const status of [record.status, record.statusCode, (record.response as Record<string, unknown> | undefined)?.status]) {
    if (status === 429) return true
  }

  if (typeof record.message === 'string' && RATE_LIMIT_MESSAGE.test(record.message)) return true

  return inspectFailure(record.cause, depth + 1, codes)
}

// ─── 文本聚合(与宿主 BlockAssembler 同语义的最小子集) ───

export interface AggregatedAssistantText {
  text: string
  reason: LlmFinishReasonLike
}

interface TextCollector {
  push(chunk: LlmStreamChunk): void
  result(): AggregatedAssistantText
}

/**
 * 聚合 \`StreamChunk\`:\`text-delta\` 权威;某 index 没有 delta 时才回退 \`block-end\` 的整块文本
 * (两种下发风格都不丢正文、也不重复累加)。未知块类型忽略(协议可扩展)。
 */
function createTextCollector(): TextCollector {
  const parts: string[] = []
  const deltaIndexes = new Set<number>()
  let reason: LlmFinishReasonLike = { kind: 'stop' }
  return {
    push(chunk) {
      switch (chunk.type) {
        case 'text-delta':
          deltaIndexes.add(chunk.index)
          parts.push(chunk.text)
          return
        case 'block-end':
          if (chunk.block.type === 'text' && !deltaIndexes.has(chunk.index) && typeof chunk.block.text === 'string') {
            parts.push(chunk.block.text)
          }
          return
        case 'finish':
          reason = chunk.reason
          return
        default:
          return
      }
    },
    result() {
      return { text: parts.join(''), reason }
    },
  }
}

export function aggregateAssistantText(chunks: Iterable<LlmStreamChunk>): AggregatedAssistantText {
  const collector = createTextCollector()
  for (const chunk of chunks) collector.push(chunk)
  return collector.result()
}

// ─── launcher ───

/** 子任务消息:plugin 来源的 user 消息(宿主 Message 结构,id 由本插件铸造)。 */
export function createSubagentMessage(prompt: string): LlmMessageLike {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: prompt }],
    source: { kind: 'plugin', plugin: PLUGIN_NAME },
  }
}

function messageOf(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return String(value)
}

/**
 * 造一个调度器 launcher:每个子任务 = 一次 \`llm.stream\` 调用。
 *
 * - 首个请求发出前 \`onReady\`(调度器据此分流限流重/轻罚);
 * - 正常收尾取聚合文本(trim)作结果;空结论、max-tokens 截断按 failed 上报;
 * - 限流/配额 → \`onError({rateLimit:true, ready:true})\`,由调度器挂起重排队;
 * - 任务 signal(取消/超时)传导到在途请求;\`abandoned\` 释放该任务的句柄。
 */
export function createLlmLauncher(options: LlmLauncherOptions): SwarmLauncher {
  const inFlight = new Map<number, AbortController>()
  const systemPrompt = options.systemPrompt ?? DEFAULT_SUBAGENT_SYSTEM_PROMPT
  const retryableCodes = options.retryableFailureCodes ?? DEFAULT_RETRYABLE_FAILURE_CODES
  if (
    !Array.isArray(retryableCodes) ||
    retryableCodes.length === 0 ||
    retryableCodes.some((code) => typeof code !== 'string' || code.trim() === '')
  ) {
    throw new Error('agent_swarm retryableFailureCodes must be a non-empty array of non-empty strings.')
  }
  const isRetryable = (value: unknown) => isRetryableFailure(value, retryableCodes)

  function buildOptions(task: SwarmTask, signal: AbortSignal): LlmGenerateOptionsLike {
    return {
      provider: options.provider,
      model: options.model,
      system: systemPrompt,
      messages: [createSubagentMessage(task.prompt)],
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      signal,
    }
  }

  async function runAttempt(task: SwarmTask, callbacks: AttemptCallbacks, controller: AbortController): Promise<void> {
    let stream: AsyncIterable<LlmStreamChunk>
    try {
      stream = options.llm.stream(buildOptions(task, controller.signal))
    } catch (error) {
      // 请求还没发出就失败:ready=false(调度器按重罚处理,若确属限流)。
      callbacks.onError({ message: messageOf(error), rateLimit: isRetryable(error), ready: false })
      return
    }

    callbacks.onReady()
    const collector = createTextCollector()
    try {
      for await (const chunk of stream) collector.push(chunk)
    } catch (error) {
      callbacks.onError({ message: messageOf(error), rateLimit: isRetryable(error), ready: true })
      return
    }

    const { text, reason } = collector.result()
    const trimmed = text.trim()
    const failure = reason.failure
    switch (reason.kind) {
      case 'stop':
        if (trimmed.length === 0) {
          callbacks.onError({ message: EMPTY_RESULT_MESSAGE, rateLimit: false, ready: true })
          return
        }
        callbacks.onComplete({ result: trimmed })
        return
      case 'max-tokens':
        callbacks.onError({ message: MAX_TOKENS_MESSAGE, rateLimit: false, ready: true })
        return
      case 'aborted':
        // 取消/任务超时:照样回报。批取消时调度器已 finished,会丢弃本次回调;
        // 任务超时时调度器把文案改写成 "Subagent timed out." —— 静默反而会让超时任务永不收尾。
        callbacks.onError({ message: failure?.message ?? ABORTED_RESULT_MESSAGE, rateLimit: false, ready: true })
        return
      case 'error':
        callbacks.onError({
          message: failure?.message ?? 'Subagent failed without a message.',
          rateLimit: isRetryable(failure),
          ready: true,
        })
        return
      default:
        // 协议可扩展:未知终态有正文就当完成,否则按空结论报错。
        if (trimmed.length > 0) {
          callbacks.onComplete({ result: trimmed, stopReason: reason.kind })
          return
        }
        callbacks.onError({ message: failure?.message ?? EMPTY_RESULT_MESSAGE, rateLimit: false, ready: true })
        return
    }
  }

  return {
    start(task, callbacks, signal) {
      const controller = new AbortController()
      inFlight.set(task.index, controller)

      const abortFromTask = () => controller.abort(signal.reason)
      if (signal.aborted) abortFromTask()
      else signal.addEventListener('abort', abortFromTask, { once: true })

      let released = false
      const release = () => {
        if (released) return
        released = true
        signal.removeEventListener('abort', abortFromTask)
        if (inFlight.get(task.index) === controller) inFlight.delete(task.index)
      }
      // 执行层挂给调度器的钩子:限流被 requeue 时回调,执行层据此释放句柄。
      callbacks.onSuspended = () => release()

      void runAttempt(task, callbacks, controller).catch((error: unknown) => {
        // 兜底:本模块不应抛出;真抛了也要让调度器拿到终态,不能挂死整批。
        try {
          callbacks.onError({ message: messageOf(error), rateLimit: false, ready: true })
        } catch {
          /* 调度器已收尾,回调被丢弃 */
        }
      }).finally(release)
    },

    abandoned(info) {
      const controller = inFlight.get(info.task.index)
      if (controller === undefined) return
      inFlight.delete(info.task.index)
      controller.abort()
    },
  }
}
