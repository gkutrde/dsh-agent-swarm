# 续跑验证:先用一个条目建子会话,再用保留键 agent 接力。零侵入。
param([string]$Plugin = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'

$pluginUrl = $Plugin.Replace('\', '/')
$patch = Join-Path $env:TEMP 'swarm-verify-resume.patch.yml'
@"
- insert:
    - id: agent-swarm-smoke
      name: file:///$pluginUrl/lib/index.js
      config:
        provider: deepseek-official
        model: deepseek-flash
        subagentProvider: spawn
        resumeEnabled: true
"@ | Set-Content -Path $patch -Encoding utf8

$first = Get-Content (Join-Path $PSScriptRoot 'templates/read-first-export.txt') -Raw
$second = Get-Content (Join-Path $PSScriptRoot 'templates/read-second-export.txt') -Raw
$file = "$pluginUrl/src/specs.ts"

$prompt = @"
做两段式续跑验证,严格按顺序:

第一步:调用 agent_swarm,description '第一步';prompt_template 用这段(原样):$first
items 传两个路径:['$file','$pluginUrl/src/render.ts']。
第二步:从第一步汇总里读出 src/specs.ts 那条的 agent=<子会话 id>。
第三步:再调用 agent_swarm,description '第二步续跑',items **只传一个对象条目** [{"agent":"<那个 id>","path":"$file"}],prompt_template 用这段(原样):$second

把两步汇总原文各贴一次(代码块包住),并回答:第三步成功了吗?有没有 resumed=true?agent= 是否与第一步同一个 id?
"@

Write-Output '=== 运行 headless ==='
dsh --profile headless --patch $patch $prompt 2>&1 | Select-Object -Last 50
