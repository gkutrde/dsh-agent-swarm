# 路径 B 验证:子任务 = 宿主 subagent(带工具)。零侵入:patch 在 $env:TEMP 里生成。
param([string]$Plugin = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'

$pluginUrl = $Plugin.Replace('\', '/')
$patch = Join-Path $env:TEMP 'swarm-verify-pathB.patch.yml'
@"
- insert:
    - id: agent-swarm-smoke
      name: file:///$pluginUrl/lib/index.js
      config:
        provider: deepseek-official
        model: deepseek-flash
        subagentProvider: spawn
"@ | Set-Content -Path $patch -Encoding utf8

$template = Get-Content (Join-Path $PSScriptRoot 'templates/read-first-export.txt') -Raw
$a = "$pluginUrl/src/specs.ts"
$b = "$pluginUrl/src/render.ts"

$prompt = @"
调用 agent_swarm,description 传 '路径B验证'。prompt_template 用下面这段(原样,含占位符):
$template
items 传这两个路径:['$a','$b']。
把汇总原文一字不改贴出来(用代码块包住),并说明这两个答案是否必须读文件才能得到。
"@

Write-Output '=== 挂载 patch ==='
Get-Content $patch | Write-Output
Write-Output '=== 运行 headless ==='
dsh --profile headless --patch $patch $prompt 2>&1 | Select-Object -Last 40
