/**
 * 打包断言(P0):构建产物必须真的带上 README/LICENSE/lib 等,否则使用者拿到的是没许可证的包。
 * 用法:pnpm pack:check(CI 里每次跑)。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REQUIRED = [
  'package/package.json',
  'package/lib/index.js',
  'package/README.md',
  'package/LICENSE',
  'package/CHANGELOG.md',
  // T-144:溯源与架构文档也要在包里(使用者应能在包内看到来源声明)
  'package/ARCHITECTURE.md',
  'package/THIRD-PARTY-NOTICES.md',
  'package/cordis.patch.yml',
  'package/skills/swarm-then-team/SKILL.md',
]

const dir = mkdtempSync(join(tmpdir(), 'swarm-pack-check-'))
try {
  // 跨平台调用 pnpm:在 pnpm 脚本里 npm_execpath 指向 pnpm 的 JS 入口,用 node 直接跑它
  // (Node 20+ 出于安全补丁不能无 shell 执行 .cmd/.bat;shell: true 又会有告警)。
  // 打包器:优先 pnpm(本仓库的常规入口),不可用再退 npm;两者都读 --json 拿真实路径。
  // 不依赖 npm_config_user_agent 判断:在 prepublishOnly 里 npm/pnpm 都可能出现。
  const packArgs = ['pack', '--json', '--pack-destination', dir]
  function runPacker(command) {
    try {
      return execFileSync(command, packArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform === 'win32' ? { shell: true } : {}),
      }).toString()
    } catch (error) {
      const stderr = error instanceof Error ? (error.stderr?.toString() ?? error.message) : String(error)
      console.error('[pack:check] ' + command + ' 失败: ' + stderr.trim().split('\n').slice(-2).join(' | '))
      return undefined
    }
  }
  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  let stdout = runPacker(pnpmBin) ?? runPacker(npmBin)
  if (stdout === undefined) {
    const npmExec = process.env.npm_execpath
    if (npmExec !== undefined && /\.(c?js|mjs)$/.test(npmExec)) stdout = runPacker(process.execPath) // 见下方兜底
  }
  if (stdout === undefined) throw new Error('打包器不可用(pnpm 与 npm 都失败)')
  // pnpm 输出 {filename,files};npm 输出 [{filename,files}];两者都可能夹带其它行。
  const jsonText = stdout.slice(Math.max(0, stdout.search(/[[{]/)))
  let packed
  try {
    const parsed = JSON.parse(jsonText)
    packed = Array.isArray(parsed) ? parsed[0] : parsed
  } catch {
    packed = undefined
  }
  const reported = typeof packed?.filename === 'string' ? packed.filename : undefined
  const candidates = [
    ...(reported === undefined ? [] : [join(dir, reported), join(process.cwd(), reported)]),
    ...readdirSync(dir).filter((name) => name.endsWith('.tgz')).map((name) => join(dir, name)),
    ...readdirSync(process.cwd()).filter((name) => name.endsWith('.tgz')).map((name) => join(process.cwd(), name)),
  ]
  const tarballPath = candidates.find((candidate) => existsSync(candidate))
  const tarball = tarballPath === undefined ? undefined : tarballPath.split(/[\\/]/).pop()
  if (tarball === undefined) throw new Error('pnpm pack 没有产出 tgz')
  const listing = execFileSync('tar', ['-tzf', join(dir, tarball)], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const missing = REQUIRED.filter((entry) => !listing.includes(entry))
  console.log('pack:check ' + tarball + ' (' + listing.length + ' entries)')
  for (const entry of REQUIRED) console.log((listing.includes(entry) ? '  ok   ' : '  MISS ') + entry)
  if (missing.length > 0) {
    console.error('pack:check FAILED - missing: ' + missing.join(', '))
    process.exit(1)
  }
  console.log('pack:check ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
