/**
 * 自动路径选择(T-139)。
 *
 * `subagentProvider: auto` 时,由本模块判断一次调用该走哪条路径:
 * - 路径 A(llm):一次流式调用,无工具 —— 便宜、快、有 usage;但**无法读文件**,需要工具的活会编造答案。
 * - 路径 B(subagent):完整宿主子代理,有工具、能多轮 —— 贵、慢、无 usage;能真正读文件/跑命令。
 *
 * 取舍原则:**宁可偏向 B**。A 在缺信息时不会报错,而是给出看似合理的编造内容,代价比多花点 token 高得多。
 */

export type SwarmPathMode = 'llm' | 'subagent'

export interface PathHint {
  mode: SwarmPathMode
  /** 判定理由(可追溯,进结构化值)。 */
  reason: string
}

/** 位置类字段名:出现即说明条目指向一个可被工具访问的目标。 */
const LOCATION_KEYS = ['path', 'file', 'files', 'dir', 'dirs', 'directory', 'url', 'uri', 'repo', 'repository', 'command', 'cmd', 'script']

/** 工具类关键词:模板/条目里出现即按 B 处理(中英)。 */
const TOOL_KEYWORDS = [
  '读取', '打开', '读取文件', '运行', '执行', '命令', '验证', '核验', '检查', '抓取', '访问', '文件', '目录', '路径', '源码', '仓库', '测试', '拉取', '克隆', '编译', '扫描',
  'read', 'open', 'run', 'exec', 'command', 'check', 'verify', 'validate', 'fetch', 'curl', 'clone', 'grep', 'file', 'dir', 'path', 'repo', 'test', 'diff', 'compile', 'scan',
]

export interface PathHintInput {
  /** 原始条目(字符串或对象)。 */
  items: ReadonlyArray<unknown>
  /** 模板原文(未展开也可)。 */
  promptTemplate: string
}

/** 判定一次调用该走哪条路径。纯函数,确定性,不抛。 */
export function detectPathMode(input: PathHintInput): PathHint {
  const items = Array.isArray(input.items) ? input.items : []
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const keys = Object.keys(item as Record<string, unknown>).map((k) => k.toLowerCase())
    const hit = keys.find((k) => LOCATION_KEYS.includes(k))
    if (hit !== undefined) return { mode: 'subagent', reason: 'object-item-location-field:' + hit }
  }
  const haystack = (String(input.promptTemplate ?? '') + '\n' + items.map((i) => (typeof i === 'string' ? i : JSON.stringify(i))).join('\n')).toLowerCase()
  const keyword = TOOL_KEYWORDS.find((k) => haystack.includes(k.toLowerCase()))
  if (keyword !== undefined) return { mode: 'subagent', reason: 'tool-keyword:' + keyword }
  return { mode: 'llm', reason: 'no-tool-signal' }
}
