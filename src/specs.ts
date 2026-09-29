/**
 * 规格展开与校验(T-002)— 纯函数,无副作用、无 IO。
 *
 * 把工具入参展开成 specs[](index 0-based,description 展示 1-based),
 * 五条前置校验顺序固定,任一违反即带文案 throw(在任何子任务启动之前)。
 * 契约见 项目文档/03-模块文档-规格展开与校验.md。
 */

export const MIN_ITEMS = 2
export const MAX_ITEMS = 128
export const ITEM_PLACEHOLDER = '{{item}}'
/** 内置变量:当前条目的 1-based 序位 / 条目总数(T-126)。 */
export const INDEX_PLACEHOLDER = '{{index}}'
export const TOTAL_PLACEHOLDER = '{{total}}'
/** 对象条目的字段占位符:{{item.<key>}}(key 限字母/数字/下划线/连字符)。 */
export const ITEM_FIELD_PLACEHOLDER = /\{\{item\.([A-Za-z0-9_-]+)\}\}/
const ITEM_FIELD_PLACEHOLDER_GLOBAL = /\{\{item\.([A-Za-z0-9_-]+)\}\}/g
const ITEM_KEY_PATTERN = /^[A-Za-z0-9_-]+$/

export const ERRORS = {
  tooFewItems: 'agent_swarm requires at least 2 items.',
  tooManyItems: 'agent_swarm supports at most 128 subagents.',
  missingTemplate: 'agent_swarm requires a prompt_template when items are provided.',
  missingPlaceholder: 'agent_swarm prompt_template must include the {{item}} placeholder.',
  duplicatePrompts: (a: number, b: number) =>
    `Duplicate subagent prompts from items ${a} and ${b}. agent_swarm requires distinct subagents.`,
  blankItem: (n: number) => `agent_swarm items must not contain blank entries (item ${n} is blank).`,
  promptTooLong: (limit: number, length: number, n: number) =>
    `agent_swarm expanded prompt exceeds ${limit} characters (got ${length}) for item ${n}.`,
  invalidResumeAgent: (n: number) =>
    `agent_swarm item ${n} has an "agent" field that is not a non-empty child session id.`,
  invalidItem: (n: number) =>
    `agent_swarm items must be strings or flat objects of string/number fields (item ${n} is invalid).`,
  missingField: (key: string, n: number) =>
    `agent_swarm prompt_template references {{item.${key}}} but item ${n} has no such field.`,
  fieldPlaceholderOnStringItem: (key: string, n: number) =>
    `agent_swarm prompt_template uses {{item.${key}}} but item ${n} is a string; pass an object item with that field.`,
} as const

export interface SwarmSpecOptions {
  /** 展开后单条 prompt 的字符上限;缺省 = 不限。 */
  maxPromptChars?: number
}

/** 对象条目:仅接受浅层 string/number 字段。 */
export type SwarmItemObject = Record<string, string | number>
export type SwarmItem = string | SwarmItemObject

export interface SwarmArgs {
  description: string
  prompt_template?: string
  items: SwarmItem[]
}

export interface SwarmSpec {
  /** 0-based 连续编号(调度器结果落位同用 0-based)。 */
  index: number
  item: string
  prompt: string
  /** `${description} #${index+1}` — 展示用 1-based。 */
  description: string
  /** 对象条目的保留键 `agent`:续跑该可继续子会话(T-103)。 */
  resumeAgentId?: string
}

/** 校验对象条目形状:非空、键名合法、值只能是 string 或有限 number。 */
function assertValidItemObject(item: unknown, n: number): asserts item is SwarmItemObject {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error(ERRORS.invalidItem(n))
  const entries = Object.entries(item as Record<string, unknown>)
  if (entries.length === 0) throw new Error(ERRORS.invalidItem(n))
  for (const [key, value] of entries) {
    if (!ITEM_KEY_PATTERN.test(key)) throw new Error(ERRORS.invalidItem(n))
    // 保留键 agent = 续跑目标(可继续子会话 id),只接受非空字符串。
    if (key === 'agent') {
      if (typeof value !== 'string' || value.trim() === '') throw new Error(ERRORS.invalidResumeAgent(n))
      continue
    }
    if (typeof value === 'string') continue
    if (typeof value === 'number' && Number.isFinite(value)) continue
    throw new Error(ERRORS.invalidItem(n))
  }
}

/**
 * 展开单条 item:字符串走 {{item}} 全局替换;对象先替换 {{item.<key>}} 字段占位符,
 * 剩下的 {{item.<key>}} 视为缺字段直接报错(fail fast,不静默留占位符),
 * 最后把 {{item}} 替换为该对象的 JSON。
 */
function expandItem(template: string, item: SwarmItem, index: number, total: number): string {
  // 内置变量先展开(与 {{item.<key>}} 是不同的记号,互不干扰)。
  const withBuiltins = template
    .split(INDEX_PLACEHOLDER)
    .join(String(index + 1))
    .split(TOTAL_PLACEHOLDER)
    .join(String(total))
  if (typeof item === 'string') {
    // 字符串条目只有 {{item}} 可用:字段占位符留在串里只会变成空/字面量,必须明确报错。
    const fieldOnString = ITEM_FIELD_PLACEHOLDER.exec(withBuiltins)
    if (fieldOnString !== null) throw new Error(ERRORS.fieldPlaceholderOnStringItem(fieldOnString[1], index + 1))
    return withBuiltins.split(ITEM_PLACEHOLDER).join(item)
  }
  let expanded = withBuiltins
  for (const [key, value] of Object.entries(item)) {
    expanded = expanded.split(`{{item.${key}}}`).join(String(value))
  }
  const leftover = ITEM_FIELD_PLACEHOLDER.exec(expanded)
  if (leftover !== null) throw new Error(ERRORS.missingField(leftover[1], index + 1))
  return expanded.split(ITEM_PLACEHOLDER).join(JSON.stringify(item))
}

export function createSwarmSpecs(args: SwarmArgs, options: SwarmSpecOptions = {}): SwarmSpec[] {
  const items = args.items
  // 校验顺序固定(①→⑦),全部先于任何 specs 生成。
  // ① 计数:新建条目走扇出语义(≥2);**纯续跑批允许单条**(续跑是接力,不是扇出)。
  const hasResume = items.some(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item) && typeof (item as SwarmItemObject).agent === 'string' && ((item as SwarmItemObject).agent as string).trim() !== '',
  )
  if (!hasResume && items.length < MIN_ITEMS) throw new Error(ERRORS.tooFewItems)
  if (items.length > MAX_ITEMS) throw new Error(ERRORS.tooManyItems)
  for (const [index, item] of items.entries()) {
    if (typeof item === 'string') {
      if (item.trim() === '') throw new Error(ERRORS.blankItem(index + 1))
      continue
    }
    assertValidItemObject(item, index + 1)
  }
  const template = args.prompt_template
  if (!template) throw new Error(ERRORS.missingTemplate)
  // 占位符:{{item}} 或任一 {{item.<key>}} 都算合法(对象条目常只用字段占位符)。
  if (!template.includes(ITEM_PLACEHOLDER) && !ITEM_FIELD_PLACEHOLDER.test(template)) {
    throw new Error(ERRORS.missingPlaceholder)
  }
  // 字符串条目:split/join 全局替换;对象条目:字段占位符 + {{item}} → JSON。
  const prompts = items.map((item, index) => expandItem(template, item, index, items.length))

  const seen = new Map<string, number>()
  for (const [index, prompt] of prompts.entries()) {
    // 去重键要带续跑目标:不同子会话续同一句话是**不同子任务**,不算重复;同一子会话续两次才算。
    const item = items[index]
    const target =
      typeof item === 'object' && item !== null && typeof (item as SwarmItemObject).agent === 'string'
        ? ((item as SwarmItemObject).agent as string)
        : ''
    const key = target + '\n' + prompt
    const previous = seen.get(key)
    if (previous !== undefined) throw new Error(ERRORS.duplicatePrompts(previous + 1, index + 1))
    seen.set(key, index)
  }

  if (options.maxPromptChars !== undefined) {
    for (const [index, prompt] of prompts.entries()) {
      if (prompt.length > options.maxPromptChars) {
        throw new Error(ERRORS.promptTooLong(options.maxPromptChars, prompt.length, index + 1))
      }
    }
  }

  return items.map((item, index) => ({
    index,
    // 展示标签:字符串原样;对象 JSON 化(单行,渲染层再做空白折叠)。
    item: typeof item === 'string' ? item : JSON.stringify(item),
    prompt: prompts[index],
    description: `${args.description} #${index + 1}`,
    ...(typeof item === 'string' || typeof item.agent !== 'string' ? {} : { resumeAgentId: item.agent }),
  }))
}
