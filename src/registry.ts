/**
 * 批次状态注册表(T-141)。
 *
 * 目的:把「正在跑的批次 / 最近完成的批次」暴露成宿主服务(`ctx.provide`),
 * 供其它插件或 UI 查询(对齐同类实现的 swarm-registry 能力)。
 *
 * 设计原则:
 * - **纯内存、有界**(默认保留最近 5 个批次),不落盘、不阻塞批处理;
 * - **自身异常绝不影响批处理**:所有方法内部吞掉异常,只在能服务时服务;
 * - 对外返回**副本**,消费者改不动内部状态。
 */

export interface SwarmRegistryItem {
  index: number
  item: string
  state: string
  outcome: string
  reason?: string
  agentId?: string
  elapsedMs?: number
}

export interface SwarmBatchSnapshot {
  id: string
  description: string
  /** 本次实际走的路径(llm | subagent);未知时缺席。 */
  path?: string
  /** 批次声明的条目数。 */
  declaredCount: number
  startedAt: number
  finishedAt?: number
  counts: { completed: number; failed: number; aborted: number }
  items: SwarmRegistryItem[]
}

export interface SwarmRegistryOptions {
  /** 历史保留条数(默认 5)。 */
  historyLimit?: number
}

export interface SwarmRegistryLike {
  current(): SwarmBatchSnapshot | undefined
  list(): SwarmBatchSnapshot[]
  get(id: string): SwarmBatchSnapshot | undefined
}

let sequence = 0

export class SwarmRegistry implements SwarmRegistryLike {
  readonly #historyLimit: number
  readonly #history: SwarmBatchSnapshot[] = []
  #current: SwarmBatchSnapshot | undefined

  constructor(options: SwarmRegistryOptions = {}) {
    const limit = options.historyLimit
    this.#historyLimit = Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : 5
  }

  /** 开始一个批次,返回批次 id(异常不外抛)。 */
  begin(input: { description: string; path?: string; count: number; startedAt?: number }): string {
    sequence += 1
    const id = 'batch-' + sequence
    try {
      this.#current = {
        id,
        description: String(input.description ?? ''),
        ...(input.path === undefined ? {} : { path: input.path }),
        declaredCount: Number.isFinite(input.count) ? input.count : 0,
        startedAt: input.startedAt ?? Date.now(),
        counts: { completed: 0, failed: 0, aborted: 0 },
        items: [],
      }
    } catch {
      /* 注册表不参与业务正确性 */
    }
    return id
  }

  /** 记录一条落位(异常不外抛;没有 current 时忽略)。 */
  settle(entry: SwarmRegistryItem): void {
    try {
      const current = this.#current
      if (current === undefined) return
      current.items.push({ ...entry })
      if (entry.outcome === 'completed' || entry.outcome === 'failed' || entry.outcome === 'aborted') {
        current.counts[entry.outcome] += 1
      }
    } catch {
      /* 同上 */
    }
  }

  /** 结束当前批次:进历史(有界),异常不外抛。 */
  finish(input: { finishedAt?: number } = {}): void {
    try {
      const current = this.#current
      if (current === undefined) return
      current.finishedAt = input.finishedAt ?? Date.now()
      this.#history.unshift(current)
      if (this.#history.length > this.#historyLimit) this.#history.length = this.#historyLimit
      this.#current = undefined
    } catch {
      /* 同上 */
    }
  }

  /** 当前在跑的批次(副本)。 */
  current(): SwarmBatchSnapshot | undefined {
    return this.#current === undefined ? undefined : clone(this.#current)
  }

  /** 历史批次,newest first(副本)。 */
  list(): SwarmBatchSnapshot[] {
    return this.#history.map(clone)
  }

  /** 按 id 查:先在跑的,再历史(副本)。 */
  get(id: string): SwarmBatchSnapshot | undefined {
    if (this.#current?.id === id) return clone(this.#current)
    const found = this.#history.find((batch) => batch.id === id)
    return found === undefined ? undefined : clone(found)
  }
}

/** 深拷一层即可:快照结构固定且不含嵌套引用。 */
function clone(snapshot: SwarmBatchSnapshot): SwarmBatchSnapshot {
  return { ...snapshot, counts: { ...snapshot.counts }, items: snapshot.items.map((item) => ({ ...item })) }
}
