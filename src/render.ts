/**
 * 结果汇总渲染(T-005)— 纯函数,把调度器结果渲染成回给主 agent 的文本。
 *
 * 契约见内部模块文档。安全要点:正文不裸拼进结构化标签,避免正文里的标记破坏外层结构,
 * 而是逐条带元数据行 + **动态长度围栏**(围栏比正文里最长的反引号串还长),
 * 因此正文含 \`<subagent>\`、\`</agent_swarm_result>\`、\`\`\` 围栏等任意标记文本时,
 * 外层结构都不崩、正文逐字保留。
 */
import type { SwarmResultEntry } from './scheduler.ts'

const FENCE_CHAR = '`'

export const SWARM_HEADER_PREFIX = 'agent_swarm: '
export const UNKNOWN_BODY = 'unknown error'
export const RETRY_HINT =
  'Not all subagent runs completed; agent_swarm is one-shot in this version — re-invoke it with the remaining items to retry.'

/** 正文围栏:比正文内最长反引号串长 1(下限 3),保证正文无法提前闭合围栏。 */
export function fenceFor(body: string): string {
  let longest = 0
  let run = 0
  for (const char of body) {
    if (char === FENCE_CHAR) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return FENCE_CHAR.repeat(Math.max(3, longest + 1))
}

/** 元数据行内的自由文本压成单行:换行/制表符折叠为空格,避免撑破逐条结构。 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stringifyBody(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return UNKNOWN_BODY
  try {
    const json = JSON.stringify(value, null, 2)
    return json === undefined ? String(value) : json
  } catch {
    // 循环引用等不可序列化结果:退化为 String,绝不让渲染抛错。
    return String(value)
  }
}

export function bodyOf(result: SwarmResultEntry): string {
  return stringifyBody(result.status === 'completed' ? result.result : result.error)
}

/** 单条正文的截断结果:body = 保留正文(含截断标记),omitted = 省略字符数(0 = 未截断)。 */
export function truncateBody(body: string, maxBodyChars?: number): { body: string; omitted: number } {
  if (maxBodyChars === undefined || !Number.isFinite(maxBodyChars) || maxBodyChars <= 0) return { body, omitted: 0 }
  if (body.length <= maxBodyChars) return { body, omitted: 0 }
  const omitted = body.length - maxBodyChars
  return { body: `${body.slice(0, maxBodyChars)}\n… [truncated: ${omitted} chars omitted]`, omitted }
}

/**
 * 渲染汇总文本:头部只报非零计数;逐条 \`[#N] item=… state=… outcome=… [stop_reason=…]\` + 围栏正文;
 * 存在未完成项时追加续跑提示。不抛。
 */
export interface RenderSwarmOptions {
  /** 单条正文最大字符数;缺省/≤0 = 不截断(默认,保持 A-03「逐字保留」语义)。 */
  maxBodyChars?: number
}

/**
 * 单条结果的元数据行(进度日志与汇总共用同一函数,保证两处逐字一致)。
 * 顺序:base → stop_reason → attempts(>1) → throttled → elapsedMs → truncated。
 */
export function formatResultLine(result: SwarmResultEntry): string {
  const parts = [`[#${result.task.index + 1}]`, `item=${oneLine(result.task.item)}`, `state=${result.state}`, `outcome=${result.status}`]
  if (result.task.resumeAgentId !== undefined) parts.push('resumed=true')
  if (result.stopReason !== undefined) parts.push(`stop_reason=${oneLine(result.stopReason)}`)
  if (result.attempts !== undefined && result.attempts > 1) parts.push(`attempts=${result.attempts}`)
  if (result.throttled === true) parts.push('throttled=true')
  if (result.elapsedMs !== undefined) parts.push(`elapsedMs=${result.elapsedMs}`)
  if (result.agentId !== undefined) parts.push(`agent=${oneLine(result.agentId)}`)
  return parts.join(' ')
}

export function renderSwarmResults(results: readonly SwarmResultEntry[], options: RenderSwarmOptions = {}): string {
  const counts = { completed: 0, failed: 0, aborted: 0 }
  for (const result of results) counts[result.status] += 1
  const summary = (['completed', 'failed', 'aborted'] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${status}: ${counts[status]}`)

  const lines: string[] = [
    `${SWARM_HEADER_PREFIX}${results.length} items — ${summary.length > 0 ? summary.join(', ') : 'completed: 0'}`,
    '',
  ]

  for (const result of results) {
    const { body, omitted } = truncateBody(bodyOf(result), options.maxBodyChars)
    const line = formatResultLine(result)
    const fence = fenceFor(body)
    lines.push(omitted > 0 ? line + ' truncated=' + omitted : line)
    lines.push(`${fence}text`)
    lines.push(body)
    lines.push(fence)
  }

  if (results.some((result) => result.status !== 'completed')) {
    lines.push('')
    lines.push(RETRY_HINT)
  }

  return lines.join('\n')
}

/** 结构化结果值:上层可直接取字段,不必正则解析文本行(宿主 schema 为对象根)。 */
export interface SwarmValueItem {
  index: number
  item: string
  state: string
  outcome: string
  body: string
  stopReason?: string
  attempts?: number
  throttled?: boolean
  elapsedMs?: number
  agentId?: string
  resumed?: boolean
  truncated?: number
}
export interface SwarmValue {
  /** 人类可读汇总:与用户看到的逐字一致(由 renderSwarmResults 生成,此处只做承载)。 */
  text: string
  counts: { completed: number; failed: number; aborted: number }
  items: SwarmValueItem[]
}

export function swarmResultValue(
  results: readonly SwarmResultEntry[],
  text: string,
  options: RenderSwarmOptions = {},
): SwarmValue {
  const counts = { completed: 0, failed: 0, aborted: 0 }
  const items: SwarmValueItem[] = []
  for (const result of results) {
    counts[result.status] += 1
    const { body, omitted } = truncateBody(bodyOf(result), options.maxBodyChars)
    items.push({
      index: result.task.index,
      item: result.task.item,
      state: result.state,
      outcome: result.status,
      body,
      ...(result.stopReason === undefined ? {} : { stopReason: result.stopReason }),
      ...(result.attempts === undefined ? {} : { attempts: result.attempts }),
      ...(result.throttled === true ? { throttled: true } : {}),
      ...(result.elapsedMs === undefined ? {} : { elapsedMs: result.elapsedMs }),
      ...(result.agentId === undefined ? {} : { agentId: result.agentId }),
      ...(result.task.resumeAgentId === undefined ? {} : { resumed: true }),
      ...(omitted > 0 ? { truncated: omitted } : {}),
    })
  }
  return { text, counts, items }
}
