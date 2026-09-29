# 删库后一键重建远端:建仓 → 推 main+标签 → 重建 Release 与附件。
# 用法:pwsh -NoProfile -File scripts/rebuild-remote.ps1
# 令牌从 git 凭据管理器读取(不落地、不打印)。
$ErrorActionPreference = 'Stop'
$env:GIT_TERMINAL_PROMPT = '0'
$repository = 'gkutrde/dsh-agent-swarm'

$cred = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>$null) -split "`n"
$token = (($cred | Where-Object { $_ -like 'password=*' }) -replace '^password=','').Trim()
$headers = @{ Authorization = "token $token"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'rebuild-remote' }

Write-Output '=== 1) 确保仓库存在 ==='
try { $repo = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository" -Headers $headers; Write-Output "已存在: $($repo.html_url)" }
catch {
  $body = @{ name = 'dsh-agent-swarm'; description = 'Fan out one prompt template over N items to a swarm of subagents - an agent_swarm tool for DeepSeek Harness (dsh).'; private = $false; has_issues = $true } | ConvertTo-Json
  $repo = Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $headers -Body $body -ContentType 'application/json'
  Write-Output "已创建: $($repo.html_url)"
  Start-Sleep -Seconds 3
}

Write-Output '=== 2) 推送 main 与标签 ==='
git push -u origin main --force 2>&1 | Select-Object -Last 1 | Write-Output
git push origin --force --tags 2>&1 | Select-Object -Last 1 | Write-Output

Write-Output '=== 3) 打包(版本取自 package.json) ==='
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
Remove-Item '*.tgz' -Force -ErrorAction SilentlyContinue
pnpm pack 2>&1 | Select-Object -Last 1 | Out-Null
$tarball = (Get-ChildItem '*.tgz' | Select-Object -First 1).FullName
Write-Output "已打包: $tarball ($([math]::Round((Get-Item $tarball).Length/1KB,1)) KB) 标签 $tag"

Write-Output '=== 4) Release 与附件 ==='
$existing = $null
try { $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository/releases/tags/$tag" -Headers $headers } catch { $existing = $null }
if ($existing) {
  Write-Output "Release 已存在: $($existing.html_url)"
} else {
  $changelog = Get-Content 'CHANGELOG.md' -Raw
  $start = $changelog.IndexOf('## [' + $version + ']')
  $notes = if ($start -ge 0) { $changelog.Substring($start) } else { "dsh-agent-swarm $version" }
  $relBody = @{ tag_name = $tag; name = "dsh-agent-swarm $version"; body = $notes; draft = $false; prerelease = $false } | ConvertTo-Json
  $rel = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$repository/releases" -Headers $headers -Body $relBody -ContentType 'application/json'
  Write-Output "Release 已创建: $($rel.html_url)"
  $uploaded = Invoke-RestMethod -Method Post -Uri "https://uploads.github.com/repos/$repository/releases/$($rel.id)/assets?name=$([System.IO.Path]::GetFileName($tarball))" -Headers $headers -ContentType 'application/octet-stream' -InFile $tarball
  Write-Output "附件已上传: $($uploaded.name) $([math]::Round($uploaded.size/1KB,1)) KB"
}
Remove-Item '*.tgz' -Force -ErrorAction SilentlyContinue

Write-Output '=== 5) 复核 ==='
$check = Invoke-RestMethod -Uri "https://api.github.com/repos/$repository" -Headers $headers
Write-Output "repo=$($check.full_name) private=$($check.private)"
Write-Output "远端 main: $((git ls-remote --heads origin main) -join '')"
Write-Output "远端标签: $((git ls-remote --tags origin) -join ' | ')"

