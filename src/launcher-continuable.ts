/**
 * 子代理执行层 · 可续跑路径(T-103)— 子级是**可继续子会话**(durable),因此没有 `result` Promise:
 * - 新建:`ctx.subagents.startContinuable({ provider, label, request, signal })` → `{ childId }`
 * - 续跑:`ctx.subagents.sendMessage(parent, childId, content, { signal })`(同一子会话接新一轮)
 * - 取结果:轮询 `agents.get(childId).status === 'idle'` 判该轮结束 → `sessions.readSession(childId)`
 *   取最后一条非空 `assistant/message` 的 `data.message.content`(字符串或分片数组)
 * - `abandoned` 只 `interrupt`,**绝不 dispose**(dispose 会毁掉可续跑的会话)
 *
 * 事实出处(宿主类型声明 + 运行时探针):`AgentStatus = 'idle'|'running'`(dsh-agent runtime-types L90);
 * `readSession → { session, inheritedEventCount, events }`(dsh-session-query L74/L34);
 * `assistant/message` 正文在 `data.message.content`(T-103 探针实测)。
 */
import { EMPTY_RESULT_MESSAGE } from './launcher-llm.ts'
import { sliceAtCodePoint } from './render.ts'
import type { AttemptCallbacks, SwarmLauncher, SwarmTask } from './scheduler.ts'

export const SUBAGENT_TURN_TIMEOUT_MESSAGE = 'Subagent turn did not finish in time.'

export interface SessionEventLike {
  type?: string
  seq?: number
  data?: { message?: { content?: unknown } }
}
export interface SessionLogSnapshotLike { events?: SessionEventLike[] }
export interface SessionQueryLike {
  readSession(sessionId: string): Promise<SessionLogSnapshotLike>
}
export interface AgentLookupLike {
  get(id: string): { status?: string } | undefined
}
export interface ContinuableStartSpecLike {
  provider: string
  label: string
  request: {
    prompt: Array<{ type: 'text'; text: string }>
    parent: unknown
    /** 宿主 AgentOptions 覆盖(provider/model/reasoningEffort/maxTokens);需提供方支持该能力。 */
    agentOptions?: Record<string, unknown>
  }
  signal: AbortSignal
}
export interface ContinuableSubagentServiceLike {
  startContinuable(spec: ContinuableStartSpecLike): Promise<{ childId: string; messageId: string }>
  sendMessage(
    parent: unknown,
    targetId: string,
    content: Array<{ type: 'text'; text: string }>,
    options: { signal?: AbortSignal },
  ): Promise<string>
  interrupt?(targetId: string, authority: unknown): void
}
export interface ContinuableLauncherOptions {
  subagents: ContinuableSubagentServiceLike
  sessions: SessionQueryLike
  /** 可选:判定子级这一轮是否结束(status === 'idle')。 */
  agents?: AgentLookupLike
  provider: string
  /** 调用方 agent(子级的 parent)。 */
  parent: unknown
  /** 轮询间隔(ms),默认 500。 */
  pollIntervalMs?: number
  /** 单轮超时(ms):**0/负数 = 不设超时**(与调度器 timeoutMs 对齐时用它)。 */
  turnTimeoutMs?: number
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

/** 把 assistant 消息的 content(字符串或分片数组)归一化成纯文本。 */
export function normalizeAssistantContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        const text = (part as { text?: unknown } | null)?.text
        return typeof text === 'string' ? text : ''
      })
      .join('')
      .trim()
  }
  return ''
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

/** 在调用点从 agent 作用域取宿主服务(cordis 不允许插件直接访问未 inject 的服务)。 */
export function resolveHostService<T>(agent: unknown, name: string): T | undefined {
  const agentCtx = (agent as { ctx?: { get?: (serviceName: string) => unknown } } | undefined)?.ctx
  try {
    return (agentCtx?.get?.(name) ?? undefined) as T | undefined
  } catch {
    return undefined
  }
}

export function createContinuableSubagentLauncher(options: ContinuableLauncherOptions): SwarmLauncher {
  if (typeof options.provider !== 'string' || options.provider.trim() === '') {
    throw new Error('agent_swarm subagentProvider must be a non-empty provider name.')
  }
  const pollIntervalMs = options.pollIntervalMs ?? 500
  const turnTimeoutMs = options.turnTimeoutMs ?? 600000
  const inFlight = new Map<number, string>()
  const abandoned = new Set<number>()

  async function readAssistant(childId: string): Promise<{ text: string; lastSeq: number }> {
    const snapshot = await options.sessions.readSession(childId)
    const events = Array.isArray(snapshot?.events) ? snapshot.events : []
    let text = ''
    let lastSeq = -1
    for (const event of events) {
      if (event?.type !== 'assistant/message') continue
      const normalized = normalizeAssistantContent(event.data?.message?.content)
      if (normalized === '') continue
      text = normalized
      lastSeq = typeof event.seq === 'number' ? event.seq : lastSeq
    }
    return { text, lastSeq }
  }

  async function waitForTurn(childId: string, baselineSeq: number, signal: AbortSignal, taskIndex: number): Promise<string | null> {
    // turnTimeoutMs <= 0 = 不设轮超时(由调度器的 per-task timeoutMs 兜底)。
    const deadline = turnTimeoutMs > 0 ? Date.now() + turnTimeoutMs : Number.POSITIVE_INFINITY
    for (;;) {
      if (signal.aborted || abandoned.has(taskIndex)) return null
      const status = options.agents?.get(childId)?.status
      // 省 IO:有状态面时,running 期间**完全不读会话**(长子会话的整份读是 O(n²))。
      if (status === undefined || status === 'idle') {
        const { text, lastSeq } = await readAssistant(childId)
        if (lastSeq > baselineSeq) return text
      }
      if (Date.now() >= deadline) return null
      await delay(pollIntervalMs, signal)
    }
  }

  async function run(task: SwarmTask, callbacks: AttemptCallbacks, signal: AbortSignal): Promise<void> {
    let childId: string
    let baselineSeq = -1
    const prompt = [{ type: 'text' as const, text: task.prompt }]
    try {
      if (task.resumeAgentId !== undefined) {
        childId = task.resumeAgentId
        baselineSeq = (await readAssistant(childId)).lastSeq
        await options.subagents.sendMessage(options.parent, childId, prompt, { signal })
      } else {
        const started = await options.subagents.startContinuable({
          provider: options.provider,
          label: sliceAtCodePoint(task.item, 60),
          request: {
            prompt,
            parent: options.parent,
            ...(options.agentOptions === undefined ? {} : { agentOptions: options.agentOptions }),
          },
          signal,
        })
        childId = started.childId
      }
    } catch (error) {
      callbacks.onError({ message: messageOf(error), rateLimit: false, ready: false })
      return
    }
    inFlight.set(task.index, childId)
    callbacks.onAgent?.(childId)
    callbacks.onReady()
    const text = await waitForTurn(childId, baselineSeq, signal, task.index)
    if (inFlight.get(task.index) === childId) inFlight.delete(task.index)
    if (abandoned.has(task.index)) return
    if (text === null) {
      callbacks.onError({ message: SUBAGENT_TURN_TIMEOUT_MESSAGE, rateLimit: false, ready: true })
      return
    }
    if (text === '') {
      callbacks.onError({ message: EMPTY_RESULT_MESSAGE, rateLimit: false, ready: true })
      return
    }
    callbacks.onComplete({ result: text, stopReason: 'completed' })
  }

  return {
    start(task, callbacks, signal) {
      void run(task, callbacks, signal).catch((error: unknown) => {
        try {
          callbacks.onError({ message: messageOf(error), rateLimit: false, ready: true })
        } catch {
          /* 调度器已收尾 */
        }
      })
    },
    abandoned(info) {
      const childId = inFlight.get(info.task.index)
      abandoned.add(info.task.index)
      inFlight.delete(info.task.index)
      if (childId === undefined) return
      try {
        options.subagents.interrupt?.(childId, { kind: 'ancestor', agent: options.parent })
      } catch {
        /* 打断失败不影响收尾 */
      }
    },
  }
}
