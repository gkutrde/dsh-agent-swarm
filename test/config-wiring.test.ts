import test from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply } from '../src/index.ts'
import { createLlmLauncher } from '../src/launcher-llm.ts'
import type { LlmServiceLike } from '../src/launcher-llm.ts'

// 复现 T-114:插件行没写 config 时,schemastery 会把 z.array() 解析成空数组,
// 而 launcher 要求非空码表 → 默认配置下每次调用都抛错。这条用最小假 llm 卡住接线。
const fakeLlm: LlmServiceLike = {
  stream() {
    return (async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  },
}

test('Config 默认值可直接构建 launcher(空 config 不得让必填项变成空数组)', () => {
  const resolved = Config({}) as { provider: string; model: string; retryableFailureCodes?: string[] }
  assert.equal(resolved.provider, 'deepseek-official')
  assert.equal(resolved.model, 'deepseek-flash')
  assert.ok(
    Array.isArray(resolved.retryableFailureCodes) && resolved.retryableFailureCodes.length > 0,
    'retryableFailureCodes 默认必须是非空码表,否则 launcher 构造即抛: ' + JSON.stringify(resolved.retryableFailureCodes),
  )
  assert.equal(
    String((resolved as { subagentProvider?: string }).subagentProvider ?? '').trim(),
    '',
    '默认不得启用路径 B(subagentProvider 必须为空)',
  )
  assert.doesNotThrow(() =>
    createLlmLauncher({
      llm: fakeLlm,
      provider: resolved.provider,
      model: resolved.model,
      ...(resolved.retryableFailureCodes === undefined ? {} : { retryableFailureCodes: resolved.retryableFailureCodes }),
    }),
  )
})

test('显式传空数组仍应被拒(严格校验保留)', () => {
  assert.throws(
    () => createLlmLauncher({ llm: fakeLlm, provider: 'p', model: 'm', retryableFailureCodes: [] }),
    /retryableFailureCodes/,
  )
})

test('apply 不得直接访问未注入的服务(cordis 对未 inject 的属性访问会抛错)', () => {
  const allowed = new Set(['effect', 'logger', 'tools', 'llm', 'get'])
  const registered: unknown[] = []
  const target = {
    effect: (fn: () => unknown) => { registered.push(fn()) },
    logger: { info: () => {} },
    tools: { register: (definition: unknown) => { registered.push(definition); return () => {} } },
    llm: fakeLlm,
    get: () => undefined,
  }
  // 复现 cordis 的守卫:访问未声明/未注入的服务属性即抛错
  const guarded = new Proxy(target as Record<string | symbol, unknown>, {
    get(obj, key) {
      if (typeof key === 'string' && !allowed.has(key)) {
        throw new Error('cannot get property "' + key + '" without inject')
      }
      return Reflect.get(obj, key)
    },
  })
  assert.doesNotThrow(() => apply(guarded as never, Config({}) as never))
  assert.equal(registered.length > 0, true, '工具应当被注册')
})
