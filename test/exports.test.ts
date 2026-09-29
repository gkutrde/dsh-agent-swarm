import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('built plugin entry exposes the cordis contract via named exports only', async () => {
  // Non-literal URL: resolved at runtime, so tsc does not require lib/ to exist.
  const entry = pathToFileURL(join(root, 'lib', 'index.js')).href
  const mod = await import(entry) as Record<string, unknown>
  assert.equal(mod.name, 'dsh-agent-swarm', 'named export "name"')
  assert.ok(Array.isArray(mod.inject), 'named export "inject" must be an array')
  assert.ok(mod.Config, 'named export "Config" (schemastery schema)')
  assert.equal(typeof mod.apply, 'function', 'named export "apply"')
  assert.ok(!('default' in mod), 'must NOT have a default export — cordis unwrapExports() collapses `exports.default ?? exports` and would swallow name/inject/Config')
})

test('src/index.ts contains no default export (static check)', () => {
  const src = readFileSync(join(root, 'src', 'index.ts'), 'utf8')
  assert.ok(!/^export\s+default/m.test(src), 'src/index.ts must not use `export default`')
})
