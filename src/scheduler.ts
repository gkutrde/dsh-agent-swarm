/**
 * 调度器(T-003)— 按一套既有的生产实现规格还原:放坡、限流退避与容量收缩的常量都有回归用例钉住,
 * 通过 launcher 接口与执行层解耦。常量与算法原样保留(含无抖动退避)。
 * 契约见内部模块文档;行为规格由既有生产实现约定(放坡 5/700ms、3s×2ⁿ 退避、容量收缩 2s/180s)。
 *
 * 与参考实现的差异(一期适配):
 * - launcher 只有 start(task, callbacks, signal) 一个通道(retry/resume 二期);
 *   限流重试也走 start,requeue 的 unshift + retryReadyAt 机制原样保留
 * - 不对外派发事件;挂起通过 callbacks.onSuspended 钩子通知执行层
 * - 无 agentId(spawn 才有);用 state.everLaunched 代替参考实现的 agentId !== undefined
 * - 外部 abort 一律按用户取消收尾(一期 run 不 reject;参考实现区分 isUserCancellation)
 * - index 0-based(参考实现 1-based,规避其 D2 编号基混用)
 */

export const INITIAL_LAUNCH_LIMIT = 5
export const INITIAL_LAUNCH_INTERVAL_MS = 700
export const RATE_LIMIT_RETRY_BASE_MS = 3_000
export const RATE_LIMIT_RETRY_FACTOR = 2
export const RATE_LIMIT_CAPACITY_SHRINK_INTERVAL_MS = 2_000
export const RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS = 180_000
export const SUSPENDED_REASON = 'Provider rate limit; subagent requeued for retry.'
export const SUBAGENT_TIMEOUT_MESSAGE = 'Subagent timed out.'
/** 重试预算用尽时的文案(T-111)。 */
export const ATTEMPTS_EXHAUSTED_MESSAGE = (attempts: number) =>
  `Subagent exhausted ${attempts} attempts after provider rate limiting.`
export const CANCEL_BATCH_MESSAGE = 'The user manually interrupted this subagent batch.'
export const CANCEL_STARTED_MESSAGE = 'The user manually interrupted this subagent batch before this subagent finished.'
export const CANCEL_NOT_STARTED_MESSAGE = 'The user manually interrupted this subagent batch before this subagent was started.'

const MAX_TIMEOUT_MS = 2 ** 31 - 1

/** setTimeout 的 ms 上限是 2^31-1,超出会溢出(立即触发);钳位后再排。 */
export function setClampedTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(callback, Math.min(ms, MAX_TIMEOUT_MS))
}

export interface SwarmTask {
  /** 0-based,结果落位同用。 */
  index: number
  item: string
  prompt: string
  timeoutMs?: number
  /** 续跑:该条目续的是这个可继续子会话 id(T-103);缺省 = 新建。 */
  resumeAgentId?: string
}

export interface SwarmCompletion {
  result: unknown
  stopReason?: string
}

export interface SwarmAttemptError {
  message: string
  /** true = provider 限流,进入退避重排队;调度器不识别具体错误类型,由执行层上报。 */
  rateLimit?: boolean
  /** 执行层视角的 ready(是否已发出首个请求)。重轻罚分流依据:onReady 已回调时以其为准,此值仅可升级。 */
  ready?: boolean
}

export interface AttemptCallbacks {
  onReady(): void
  /** 可选:执行层发布子会话后上报其 id(路径 B 的子会话 id;供回执追溯与二期 resume)。 */
  onAgent?(agentId: string): void
  onComplete(completion: SwarmCompletion): void
  onError(error: SwarmAttemptError): void
  /** 调度器回调:任务因限流被挂起重排队(reason = SUSPENDED_REASON)。 */
  onSuspended?(info: { reason: string }): void
}

export interface SwarmLauncher {
  start(task: SwarmTask, callbacks: AttemptCallbacks, signal: AbortSignal): void
  /** 调度器回调:死锁防护判负 / 取消时,执行层据此清理句柄(参考实现 v2 修法)。 */
  abandoned?(info: { task: SwarmTask; outcome: 'failed' | 'cancelled'; error?: string }): void
}

export interface SwarmResultEntry {
  task: SwarmTask
  status: 'completed' | 'failed' | 'aborted'
  state: 'started' | 'not_started'
  result?: unknown
  stopReason?: string
  error?: string
  /** 该任务累计尝试次数(1 = 一次就成)。 */
  attempts?: number
  /** 是否被限流挂起重排过(true 时才有值)。 */
  throttled?: boolean
  /** 首次启动到落位的耗时(ms);从未启动过的任务没有该字段。 */
  elapsedMs?: number
  /** 子会话 id(路径 B 的 subagent session id,可直接用于二期 resume)。 */
  agentId?: string
}

export interface SwarmBatchOptions {
  maxConcurrency?: number
  /** 首波并发上限;默认 INITIAL_LAUNCH_LIMIT(5)。 */
  initialLaunchLimit?: number
  /** 首波之后的放量间隔(ms);默认 INITIAL_LAUNCH_INTERVAL_MS(700)。 */
  initialLaunchIntervalMs?: number
  /** 单任务尝试上限(含首次);达到即判 failed,不再无限退避。缺省 = 不设上限(参考实现行为)。 */
  maxAttempts?: number
  /** 退避抖动上限(ms):实际退避 = 3s×2ⁿ⁻¹ + random(0..jitter)。缺省 0 = 无抖动(参考实现行为)。 */
  rateLimitBackoffJitterMs?: number
  /** 观测钩子:每条结果落位时回调一次(抛错被吞,不影响调度)。 */
  onItemSettled?: (result: SwarmResultEntry) => void
  signal?: AbortSignal
}

interface TaskState {
  index: number
  task: SwarmTask
  retryCount: number
  retryReadyAt: number
  /** onReady 过(展示/取消文案分流用)。 */
  started: boolean
  /** launcher.start 成功返回过(≈参考实现 agentId !== undefined)。 */
  everLaunched: boolean
  /** 首次启动时刻(观测 elapsedMs 用)。 */
  firstStartedAt?: number
  /** 被限流挂起重排过(观测用)。 */
  throttled: boolean
  /** 执行层上报的子会话 id(路径 B 才有)。 */
  agentId?: string
}

interface Attempt {
  state: TaskState
  controller: AbortController
  cleanup: () => void
  callbacks: AttemptCallbacks
  ready: boolean
  timedOut: boolean
}

type AttemptOutcome =
  | { kind: 'final'; result: SwarmResultEntry }
  | { kind: 'rate_limited'; error: string; ready: boolean }

export class SwarmBatch {
  private readonly launcher: SwarmLauncher
  private readonly states: TaskState[]
  private readonly pending: TaskState[]
  private readonly results: Array<SwarmResultEntry | undefined>
  private readonly active = new Set<Attempt>()
  private readonly controller = new AbortController()
  private readonly batchSignal?: AbortSignal
  private readonly batchAbortListener: () => void
  private readonly maxConcurrency?: number
  private readonly initialLaunchLimit: number
  private readonly initialLaunchIntervalMs: number
  private readonly maxAttempts?: number
  private readonly backoffJitterMs: number
  private readonly onItemSettled?: (result: SwarmResultEntry) => void

  private normalLaunchCount = 0
  private normalLaunchTimer?: ReturnType<typeof setTimeout>
  private rateLimitLaunchTimer?: ReturnType<typeof setTimeout>
  private resolve?: (results: SwarmResultEntry[]) => void
  private finished = false
  private started = false

  private rateLimitMode = false
  private startedSuccessCount = 0
  /** 测试可见:限流模式下的动态容量。 */
  rateLimitCapacity = 1
  private lastRateLimitAt?: number
  private lastCapacityShrinkAt?: number
  private lastCapacityRecoveryAt?: number
  private globalRetryIntervalMs: number = RATE_LIMIT_RETRY_BASE_MS
  private nextRateLimitLaunchAt = 0

  constructor(tasks: SwarmTask[], launcher: SwarmLauncher, options: SwarmBatchOptions = {}) {
    this.launcher = launcher
    this.maxConcurrency = options.maxConcurrency
    // 放量节奏可配(默认值 = 参考实现常数;非法值在启动任何任务之前抛错)。
    this.initialLaunchLimit = options.initialLaunchLimit ?? INITIAL_LAUNCH_LIMIT
    this.initialLaunchIntervalMs = options.initialLaunchIntervalMs ?? INITIAL_LAUNCH_INTERVAL_MS
    if (!Number.isInteger(this.initialLaunchLimit) || this.initialLaunchLimit < 1) {
      throw new Error(
        `SwarmBatch: initialLaunchLimit must be a positive integer, got ${String(options.initialLaunchLimit)}.`,
      )
    }
    this.maxAttempts = options.maxAttempts
    this.onItemSettled = options.onItemSettled
    this.backoffJitterMs = options.rateLimitBackoffJitterMs ?? 0
    if (!Number.isFinite(this.backoffJitterMs) || this.backoffJitterMs < 0) {
      throw new Error(
        `SwarmBatch: rateLimitBackoffJitterMs must be a non-negative number, got ${String(options.rateLimitBackoffJitterMs)}.`,
      )
    }
    if (this.maxAttempts !== undefined && (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1)) {
      throw new Error(`SwarmBatch: maxAttempts must be a positive integer, got ${String(options.maxAttempts)}.`)
    }
    if (!Number.isFinite(this.initialLaunchIntervalMs) || this.initialLaunchIntervalMs < 0) {
      throw new Error(
        `SwarmBatch: initialLaunchIntervalMs must be a non-negative number, got ${String(options.initialLaunchIntervalMs)}.`,
      )
    }
    this.states = tasks.map((task, index) => ({
      index,
      task,
      retryCount: 0,
      retryReadyAt: 0,
      started: false,
      everLaunched: false,
      throttled: false,
    }))
    this.pending = [...this.states]
    this.results = Array.from({ length: tasks.length })
    this.batchSignal = options.signal
    this.batchAbortListener = () => {
      this.controller.abort(this.batchSignal?.reason)
      // 一期适配:外部 abort 一律按用户取消收尾(run 不 reject)。
      this.finishWithUserCancellation()
    }
  }

  run(): Promise<SwarmResultEntry[]> {
    if (this.started) throw new Error('SwarmBatch.run() can only be called once.')
    this.started = true
    return new Promise((resolve) => {
      this.resolve = resolve
      if (this.states.length === 0) {
        this.finish([])
        return
      }
      if (this.batchSignal?.aborted === true) {
        this.batchAbortListener()
        return
      }
      this.batchSignal?.addEventListener('abort', this.batchAbortListener, { once: true })
      this.schedule()
    })
  }

  private schedule(): void {
    if (this.finished) return
    if (this.finishIfComplete()) return
    if (this.controller.signal.aborted) return
    if (this.rateLimitMode) this.scheduleRateLimitLaunch()
    else this.scheduleNormalLaunch()
  }

  private scheduleNormalLaunch(): void {
    while (
      this.normalLaunchCount < this.initialLaunchLimit &&
      this.pending.length > 0 &&
      !this.rateLimitMode &&
      !this.isAtConcurrencyLimit()
    ) {
      this.startAttempt(this.pending.shift()!)
      this.normalLaunchCount += 1
    }
    if (this.pending.length === 0 || this.rateLimitMode || this.normalLaunchTimer !== undefined || this.isAtConcurrencyLimit()) return
    this.normalLaunchTimer = setTimeout(() => {
      this.normalLaunchTimer = undefined
      if (this.finished || this.rateLimitMode || this.pending.length === 0) return
      if (this.isAtConcurrencyLimit()) return
      this.startAttempt(this.pending.shift()!)
      this.normalLaunchCount += 1
      this.schedule()
    }, this.initialLaunchIntervalMs)
  }

  private isAtConcurrencyLimit(): boolean {
    return this.maxConcurrency !== undefined && this.active.size >= this.maxConcurrency
  }

  private scheduleRateLimitLaunch(): void {
    this.clearRateLimitTimer()
    if (this.pending.length === 0) return
    const now = Date.now()
    this.recoverRateLimitCapacity(now)
    if (this.active.size >= this.rateLimitCapacity) {
      this.scheduleRateLimitWakeup(this.nextRateLimitCapacityRecoveryAt(), now)
      return
    }
    const nextAllowedAt = Math.max(this.nextRateLimitLaunchAt, this.nextPendingReadyAt())
    const nextWakeupAt = Math.min(nextAllowedAt, this.nextRateLimitCapacityRecoveryAt())
    if (nextWakeupAt > now) {
      this.scheduleRateLimitWakeup(nextWakeupAt, now)
      return
    }
    const pendingIndex = this.pending.findIndex((state) => state.retryReadyAt <= now)
    if (pendingIndex === -1) return
    const [state] = this.pending.splice(pendingIndex, 1)
    this.startAttempt(state)
    this.nextRateLimitLaunchAt = now + this.globalRetryIntervalMs
    this.scheduleNextRateLimitWakeup(now)
  }

  private startAttempt(state: TaskState): void {
    if (this.finished || this.controller.signal.aborted) return
    const attempt: Attempt = {
      state,
      controller: new AbortController(),
      cleanup: () => {},
      callbacks: undefined as unknown as AttemptCallbacks,
      ready: false,
      timedOut: false,
    }
    attempt.cleanup = this.linkAttemptSignals(attempt, state.task)
    attempt.callbacks = {
      onReady: () => this.markAttemptReady(attempt),
      // 执行层发布子会话后上报 id:落进 TaskState,收尾时随结果一起透出(T-120)。
      onAgent: (agentId: string) => {
        state.agentId = agentId
      },
      onComplete: (completion) => {
        if (this.finished || this.controller.signal.aborted || !this.active.has(attempt)) return
        const result: SwarmResultEntry = {
          task: state.task,
          status: 'completed',
          state: 'started',
          result: completion.result,
          ...(completion.stopReason !== undefined ? { stopReason: completion.stopReason } : {}),
          ...this.observe(state, Date.now()),
        }
        this.handleAttemptOutcome(attempt, { kind: 'final', result })
      },
      onError: (error) => {
        if (this.finished || this.controller.signal.aborted || !this.active.has(attempt)) return
        if (error.rateLimit) {
          // ready 以 onReady 为准(参考实现只用 attempt.ready);执行层上报的 ready 只能升级不能降级
          const ready = attempt.ready || error.ready === true
          this.handleAttemptOutcome(attempt, {
            kind: 'rate_limited',
            error: this.attemptErrorMessage(attempt, error.message, 'failed'),
            ready,
          })
        } else {
          this.handleAttemptOutcome(attempt, { kind: 'final', result: this.failedResult(attempt, error.message) })
        }
      },
      // onSuspended 由调度器在 requeue 时回调(见 requeueRateLimited)。
    }
    this.active.add(attempt)
    if (state.firstStartedAt === undefined) state.firstStartedAt = Date.now()
    try {
      attempt.controller.signal.throwIfAborted()
      this.launcher.start(state.task, attempt.callbacks, attempt.controller.signal)
      state.everLaunched = true
    } catch (error) {
      this.handleAttemptOutcome(attempt, {
        kind: 'final',
        result: this.failedResult(attempt, error instanceof Error ? error.message : String(error)),
      })
    }
  }

  /** 落位一条结果并通知观测钩子(钩子异常不得影响调度)。 */
  private storeResult(entry: SwarmResultEntry): void {
    this.results[entry.task.index] = entry
    try {
      this.onItemSettled?.(entry)
    } catch {
      /* 观测面失败不影响批 */
    }
  }

  /** 结果条目的可观测字段:尝试次数 / 是否限流挂起过 / 首次启动→落位耗时。 */
  private observe(state: TaskState, now: number) {
    return {
      attempts: state.retryCount + 1,
      ...(state.agentId === undefined ? {} : { agentId: state.agentId }),
      ...(state.throttled ? { throttled: true } : {}),
      ...(state.firstStartedAt === undefined ? {} : { elapsedMs: now - state.firstStartedAt }),
    }
  }

  private failedResult(attempt: Attempt, message: string): SwarmResultEntry {
    const aborted = attempt.controller.signal.aborted && !attempt.timedOut
    const status = aborted ? 'aborted' : 'failed'
    return {
      task: attempt.state.task,
      status,
      state: attempt.state.everLaunched ? 'started' : 'not_started',
      error: this.attemptErrorMessage(attempt, message, status),
      ...this.observe(attempt.state, Date.now()),
    }
  }

  private markAttemptReady(attempt: Attempt): void {
    if (this.finished || attempt.ready || !this.active.has(attempt)) return
    attempt.ready = true
    attempt.state.started = true
    if (!this.rateLimitMode) this.startedSuccessCount += 1
    if (this.rateLimitMode) {
      // 限流模式内一次成功:全局间隔复位 3s。
      this.globalRetryIntervalMs = RATE_LIMIT_RETRY_BASE_MS
      this.nextRateLimitLaunchAt = Date.now() + this.globalRetryIntervalMs
      this.schedule()
    }
  }

  private handleAttemptOutcome(attempt: Attempt, outcome: AttemptOutcome): void {
    if (!this.releaseAttempt(attempt)) return
    if (this.finished) return
    if (outcome.kind === 'final') {
      this.storeResult(outcome.result)
    } else if (this.maxAttempts !== undefined && attempt.state.retryCount + 1 >= this.maxAttempts) {
      // 重试预算用尽:不再退避重排队,判 failed 并回调 abandoned 释放句柄。
      const error = ATTEMPTS_EXHAUSTED_MESSAGE(this.maxAttempts)
      this.launcher.abandoned?.({ task: attempt.state.task, outcome: 'failed', error })
      this.storeResult({
        task: attempt.state.task,
        status: 'failed',
        state: 'started',
        error,
        ...this.observe(attempt.state, Date.now()),
      })
    } else if (this.isOnlyUnfinishedTask(attempt.state)) {
      // 死锁防护:最后一个未完成任务持续限流,直接判负,不再无限退避。
      this.launcher.abandoned?.({ task: attempt.state.task, outcome: 'failed', error: outcome.error })
      this.storeResult({
        task: attempt.state.task,
        status: 'failed',
        state: 'started',
        error: outcome.error,
        ...this.observe(attempt.state, Date.now()),
      })
    } else {
      this.requeueRateLimited(attempt, outcome)
    }
    this.schedule()
  }

  private releaseAttempt(attempt: Attempt): boolean {
    if (!this.active.delete(attempt)) return false
    attempt.cleanup()
    return true
  }

  private requeueRateLimited(attempt: Attempt, outcome: { error: string; ready: boolean }): void {
    const state = attempt.state
    state.throttled = true
    attempt.callbacks.onSuspended?.({ reason: SUSPENDED_REASON })
    const now = Date.now()
    this.lastRateLimitAt = now
    state.retryCount += 1
    // 3000 * 2^(retryCount-1),无上限、无抖动(参考实现 createTimeout randomize:false)。
    const baseDelay = RATE_LIMIT_RETRY_BASE_MS * RATE_LIMIT_RETRY_FACTOR ** Math.max(0, state.retryCount - 1)
    // 抖动默认 0(= 参考实现的无抖动);开了之后仍只增不减,保证退避不早于 base。
    const jitter = this.backoffJitterMs > 0 ? Math.floor(Math.random() * (this.backoffJitterMs + 1)) : 0
    const retryDelay = baseDelay + jitter
    state.retryReadyAt = now + retryDelay
    this.pending.unshift(state)
    this.enterRateLimitMode(now)
    if (!outcome.ready) {
      // 未发出首请求就被限流:重罚,全局间隔 ×2。
      this.globalRetryIntervalMs = Math.max(this.globalRetryIntervalMs * RATE_LIMIT_RETRY_FACTOR, retryDelay)
      this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + this.globalRetryIntervalMs)
    } else {
      // 运行中被限流:轻罚,仅推 3s。
      this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + RATE_LIMIT_RETRY_BASE_MS)
    }
  }

  private enterRateLimitMode(now: number): void {
    if (!this.rateLimitMode) {
      this.rateLimitMode = true
      this.clearNormalTimer()
      this.rateLimitCapacity = Math.max(1, this.startedSuccessCount)
      this.nextRateLimitLaunchAt = Math.max(this.nextRateLimitLaunchAt, now + RATE_LIMIT_RETRY_BASE_MS)
      this.shrinkRateLimitCapacity(now, true)
      return
    }
    this.shrinkRateLimitCapacity(now, false)
  }

  private shrinkRateLimitCapacity(now: number, force: boolean): void {
    if (!force && this.lastCapacityShrinkAt !== undefined && now - this.lastCapacityShrinkAt < RATE_LIMIT_CAPACITY_SHRINK_INTERVAL_MS) return
    this.rateLimitCapacity = Math.max(1, this.rateLimitCapacity - 1)
    this.lastCapacityShrinkAt = now
  }

  private recoverRateLimitCapacity(now: number): void {
    if (this.nextRateLimitCapacityRecoveryAt() > now) return
    this.rateLimitCapacity += 1
    this.lastCapacityRecoveryAt = now
    this.nextRateLimitLaunchAt = Math.min(this.nextRateLimitLaunchAt, now)
  }

  private nextRateLimitCapacityRecoveryAt(): number {
    if (this.pending.length === 0 || this.lastRateLimitAt === undefined) return Number.POSITIVE_INFINITY
    return Math.max(this.lastRateLimitAt, this.lastCapacityRecoveryAt ?? 0) + RATE_LIMIT_CAPACITY_RECOVERY_INTERVAL_MS
  }

  private scheduleRateLimitWakeup(wakeupAt: number, now: number): void {
    if (!Number.isFinite(wakeupAt) || wakeupAt <= now) return
    this.rateLimitLaunchTimer = setTimeout(() => {
      this.rateLimitLaunchTimer = undefined
      this.schedule()
    }, wakeupAt - now)
  }

  private scheduleNextRateLimitWakeup(now: number): void {
    if (this.pending.length === 0) return
    const nextWakeupAt =
      this.active.size >= this.rateLimitCapacity
        ? this.nextRateLimitCapacityRecoveryAt()
        : Math.min(Math.max(this.nextRateLimitLaunchAt, this.nextPendingReadyAt()), this.nextRateLimitCapacityRecoveryAt())
    this.scheduleRateLimitWakeup(nextWakeupAt, now)
  }

  private nextPendingReadyAt(): number {
    return this.pending.reduce((nextAt, state) => Math.min(nextAt, state.retryReadyAt), Number.POSITIVE_INFINITY)
  }

  private finishIfComplete(): boolean {
    if (this.results.every((result) => result !== undefined)) {
      this.finish(this.results as SwarmResultEntry[])
      return true
    }
    return false
  }

  private isOnlyUnfinishedTask(state: TaskState): boolean {
    return this.results.every((result, index) => index === state.index || result !== undefined)
  }

  private finishWithUserCancellation(): void {
    if (this.finished) return
    this.abandonSuspended()
    this.finish(
      this.states.map((state) => {
        const result = this.results[state.index]
        if (result !== undefined) return result
        if (state.started || state.everLaunched) {
          return {
            task: state.task,
            status: 'aborted',
            state: 'started',
            error: CANCEL_STARTED_MESSAGE,
            ...this.observe(state, Date.now()),
          } as SwarmResultEntry
        }
        return {
          task: state.task,
          status: 'aborted',
          state: 'not_started',
          error: CANCEL_NOT_STARTED_MESSAGE,
        } as SwarmResultEntry
      }),
    )
  }

  private finish(results: SwarmResultEntry[]): void {
    if (this.finished) return
    this.finished = true
    this.cleanup()
    this.resolve?.(results)
  }

  private abandonSuspended(): void {
    for (const state of this.pending) {
      if (!state.everLaunched) continue
      this.launcher.abandoned?.({ task: state.task, outcome: 'cancelled' })
    }
    for (const attempt of this.active) {
      if (attempt.ready) continue
      // 参考实现以 agentId 是否已定为准:start 尚未返回的任务没有句柄,由执行层自行清理
      if (!attempt.state.everLaunched) continue
      this.launcher.abandoned?.({ task: attempt.state.task, outcome: 'cancelled' })
    }
  }

  private cleanup(): void {
    this.batchSignal?.removeEventListener('abort', this.batchAbortListener)
    this.clearNormalTimer()
    this.clearRateLimitTimer()
    for (const attempt of this.active.values()) attempt.cleanup()
    this.active.clear()
  }

  private clearNormalTimer(): void {
    if (this.normalLaunchTimer !== undefined) clearTimeout(this.normalLaunchTimer)
    this.normalLaunchTimer = undefined
  }

  private clearRateLimitTimer(): void {
    if (this.rateLimitLaunchTimer !== undefined) clearTimeout(this.rateLimitLaunchTimer)
    this.rateLimitLaunchTimer = undefined
  }

  private linkAttemptSignals(attempt: Attempt, task: SwarmTask): () => void {
    const abortFromBatch = () => {
      attempt.controller.abort(this.controller.signal.reason)
    }
    const timeout =
      task.timeoutMs === undefined || task.timeoutMs <= 0
        ? undefined
        : setClampedTimeout(() => {
            attempt.timedOut = true
            attempt.controller.abort(new Error(SUBAGENT_TIMEOUT_MESSAGE))
          }, task.timeoutMs)
    if (this.controller.signal.aborted) abortFromBatch()
    else this.controller.signal.addEventListener('abort', abortFromBatch, { once: true })
    return () => {
      if (timeout !== undefined) clearTimeout(timeout)
      this.controller.signal.removeEventListener('abort', abortFromBatch)
    }
  }

  /** 错误文案优先级:超时 > 取消 > 原始错误。 */
  private attemptErrorMessage(attempt: Attempt, message: string, status: 'failed' | 'aborted'): string {
    if (attempt.timedOut && attempt.state.task.timeoutMs !== undefined) return SUBAGENT_TIMEOUT_MESSAGE
    if (status === 'aborted') return CANCEL_BATCH_MESSAGE
    return message
  }
}

export function runSwarmBatch(tasks: SwarmTask[], launcher: SwarmLauncher, options: SwarmBatchOptions = {}): Promise<SwarmResultEntry[]> {
  return new SwarmBatch(tasks, launcher, options).run()
}
