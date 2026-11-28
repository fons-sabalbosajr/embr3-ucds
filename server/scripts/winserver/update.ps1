<#
.SYNOPSIS
  Bring the office server's E-Universe API up to the newest release: the
  highest version tag (v1.2.0) on GitHub's main whose CI "check" job passed.
  Rolls back by itself if the API does not come back healthy.

.DESCRIPTION
  The API cannot be deployed from GitHub: it runs here, next to the NAS and
  SQL Server, and nothing outside the office may reach this machine. So this
  machine pulls instead. 5-auto-update.ps1 runs this every few minutes as a
  scheduled task; it can also be run by hand in an elevated PowerShell.

    1. git fetch with tags. No version tag on main newer than what runs
       here: stop, silently. (A checkout already past the tag, from a manual
       git pull, is left alone.)
    2. Ask GitHub whether the "check" job (.github/workflows/ci-deploy.yml)
       passed for that tag's commit. Still running: try again next time.
       Failed: log it once and leave the server where it is.
    3. Fast-forward. If server/package-lock.json changed, stop the API and
       run npm ci (Windows will not replace files a running service holds).
    4. Apply pending SQL migrations (npm run sql:migrate).
    5. Restart "UCDS API" and wait for /healthz and /readyz.
    6. Any failure in 3-5: back to the previous commit (and its packages),
       restart, and remember the bad commit so it is not retried every few
       minutes. A newer commit on main is tried as usual.

  Only server/ changes restart the API. The front-end is deployed to the VPS
  by GitHub Actions; "UCDS Web" here is the fallback (add-e-universe-apex.sh
  ucds-server) and is rebuilt only while that service is running.

  A SQL migration that was applied stays applied after a rollback: they are
  written to be additive, and the older code ignores what it does not know.

  Log: C:\ucds\logs\update.log. State: C:\ucds\logs\update.state.json.
#>
param(
  [string]$AppRoot = "C:\ucds\embr3-ucds",
  [string]$Branch = "main",
  [string]$Repo = "fons-sabalbosajr/embr3-ucds",
  [string]$CheckName = "check",
  # Deploy even if CI has not passed, or retry a release that was rolled back.
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$LogDir = "C:\ucds\logs"
$Log = Join-Path $LogDir "update.log"
$StateFile = Join-Path $LogDir "update.state.json"
$LockFile = Join-Path $LogDir "update.lock"
$ApiUrl = "http://localhost:8081"
New-Item -ItemType Directory -Force $LogDir | Out-Null

function Write-Log([string]$msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  Write-Host $line
}

# Native commands write progress to stderr; under "Stop", Windows PowerShell
# 5.1 would turn that into a terminating error. Judge them by exit code.
function Invoke-Native([string]$exe, [string[]]$arguments, [string]$dir = $AppRoot) {
  $ErrorActionPreference = "Continue"
  Push-Location $dir
  try {
    $out = & $exe @arguments 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = ($out -join "`n") }
  } finally { Pop-Location }
}

# The checkout is owned by the administrator who cloned it; this runs as
# SYSTEM, which git refuses as "dubious ownership" without safe.directory.
$SafeDir = $AppRoot -replace '\\', '/'
function Git([string[]]$arguments) {
  $r = Invoke-Native "git" (@("-c", "safe.directory=$SafeDir") + $arguments)
  if ($r.Code -ne 0) { throw "git $($arguments -join ' ') failed: $($r.Out)" }
  return $r.Out.Trim()
}

$Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
function Npm([string[]]$arguments, [string]$dir) {
  $r = Invoke-Native $Npm $arguments $dir
  if ($r.Code -ne 0) {
    $tail = ($r.Out -split "`n" | Select-Object -Last 15) -join "`n"
    throw "npm $($arguments -join ' ') in $dir failed:`n$tail"
  }
}

function Get-State {
  if (Test-Path $StateFile) { try { return Get-Content $StateFile -Raw | ConvertFrom-Json } catch {} }
  return [pscustomobject]@{ failed = ""; noted = "" }
}
function Save-State($s) { $s | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8 }

# Log a waiting or refused commit once, not on every run.
function Write-Once($state, [string]$key, [string]$msg) {
  if ($state.noted -ne $key) { Write-Log $msg; $state.noted = $key; Save-State $state }
}

function Wait-Healthy([int]$seconds = 120) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $h = Invoke-WebRequest "$ApiUrl/healthz" -UseBasicParsing -TimeoutSec 5
      $r = Invoke-WebRequest "$ApiUrl/readyz" -UseBasicParsing -TimeoutSec 10
      if ($h.StatusCode -eq 200 -and $r.StatusCode -eq 200) { return $true }
    } catch {}
    Start-Sleep -Seconds 3
  }
  return $false
}

function Restart-Api {
  Restart-Service "UCDS API" -Force
  return (Wait-Healthy)
}

# ---------------------------------------------------------------------------
# One run at a time. A lock older than an hour is from a run that died.
if (Test-Path $LockFile) {
  if ((Get-Item $LockFile).LastWriteTime -gt (Get-Date).AddHours(-1)) { exit 0 }
  Remove-Item $LockFile -Force
}
New-Item -ItemType File $LockFile -Force | Out-Null

try {
  $state = Get-State

  # A hand edit on the server must not be overwritten, or silently kept.
  $dirty = Git @("status", "--porcelain", "--untracked-files=no")
  if ($dirty) { Write-Once $state "dirty" "NOT UPDATING: tracked files are changed on this server:`n$dirty"; exit 1 }

  Git @("fetch", "--quiet", "--force", "--tags", "origin", $Branch) | Out-Null
  # The newest release: the highest v* tag that is on main.
  $tag = ((Git @("tag", "--list", "v*", "--sort=-v:refname", "--merged", "origin/$Branch")) -split "`n" | Select-Object -First 1)
  if (-not $tag) { Write-Once $state "no-tag" "No release tag (v*) on $Branch yet; nothing to deploy."; exit 0 }
  $tag = $tag.Trim()
  $old = Git @("rev-parse", "HEAD")
  $new = Git @("rev-parse", "$tag^{commit}")
  if ($old -eq $new) { exit 0 }
  $short = "$tag ($($new.Substring(0, 7)))"

  function Test-Ancestor($a, $b) { (Invoke-Native "git" @("-c", "safe.directory=$SafeDir", "merge-base", "--is-ancestor", $a, $b)).Code -eq 0 }
  # Already past it (a manual git pull): nothing to do, nothing to undo.
  if (Test-Ancestor $new $old) { exit 0 }
  if (-not (Test-Ancestor $old $new)) { Write-Once $state "diverged-$new" "NOT UPDATING: $Branch on this server has commits GitHub does not; it cannot fast-forward to $short."; exit 1 }

  if (-not $Force) {
    if ($state.failed -eq $new) { exit 0 }
    # Windows PowerShell 5.1 does not offer TLS 1.2 by default.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $uri = "https://api.github.com/repos/$Repo/commits/$new/check-runs?check_name=$CheckName"
    $runs = Invoke-RestMethod $uri -Headers @{ "User-Agent" = "e-universe-update"; "Accept" = "application/vnd.github+json" } -TimeoutSec 20
    $run = $runs.check_runs | Sort-Object started_at -Descending | Select-Object -First 1
    if (-not $run -or $run.status -ne "completed") { Write-Once $state "wait-$new" "$short waiting for CI ($CheckName)"; exit 0 }
    if ($run.conclusion -ne "success") { Write-Once $state "ci-$new" "NOT UPDATING to ${short}: CI $CheckName is '$($run.conclusion)'. $($run.html_url)"; exit 0 }
  }

  $changed = @((Git @("diff", "--name-only", $old, $new)) -split "`n" | Where-Object { $_ })
  $serverChanged = [bool]($changed | Where-Object { $_ -like "server/*" })
  $serverLock = $changed -contains "server/package-lock.json"
  $webChanged = [bool]($changed | Where-Object { $_ -like "front-end/*" -or $_ -like "scripts/*" })
  $webLock = $changed -contains "front-end/package-lock.json"
  $web = Get-Service "UCDS Web" -ErrorAction SilentlyContinue
  $webRunning = $web -and $web.Status -eq "Running"

  Write-Log "Updating $($old.Substring(0, 7)) -> $short ($($changed.Count) files; server: $serverChanged, packages: $serverLock)"
  if ($serverChanged) { Write-Log "   the site shows 'temporarily unavailable' while the API restarts" }

  try {
    if ($serverLock) { Stop-Service "UCDS API" -Force }
    Git @("merge", "--ff-only", "--quiet", $new) | Out-Null
    if ($serverLock) { Npm @("ci", "--no-audit", "--no-fund") "$AppRoot\server"; Write-Log "   server packages installed" }
    if ($serverChanged) {
      Npm @("run", "sql:migrate") "$AppRoot\server"
      Write-Log "   SQL migrations applied"
      if ($serverLock) { Start-Service "UCDS API"; $ok = Wait-Healthy } else { $ok = Restart-Api }
      if (-not $ok) { throw "the API did not answer /healthz and /readyz within 2 minutes" }
      Write-Log "   UCDS API healthy"
    }
  } catch {
    Write-Log "FAILED at ${short}: $($_.Exception.Message)"
    Write-Log "   rolling back to $($old.Substring(0, 7))"
    try {
      if ($serverLock) { Stop-Service "UCDS API" -Force }
      Git @("reset", "--keep", $old) | Out-Null
      if ($serverLock) { Npm @("ci", "--no-audit", "--no-fund") "$AppRoot\server" }
      if ($serverLock) { Start-Service "UCDS API"; $back = Wait-Healthy } else { $back = Restart-Api }
      if ($back) { Write-Log "   rolled back; UCDS API healthy on $($old.Substring(0, 7))" }
      else { Write-Log "   ROLLBACK DID NOT BRING THE API BACK. Look at C:\ucds\logs\api.err.log" }
    } catch {
      Write-Log "   ROLLBACK FAILED: $($_.Exception.Message)"
    }
    $state.failed = $new; Save-State $state
    exit 1
  }

  # The fallback front-end, only while it is in use.
  if ($webRunning -and $webChanged) {
    try {
      if ($webLock) { Stop-Service "UCDS Web" -Force; Npm @("ci", "--no-audit", "--no-fund") "$AppRoot\front-end" }
      Npm @("run", "build") "$AppRoot\front-end"
      if ($webLock) { Start-Service "UCDS Web" } else { Restart-Service "UCDS Web" -Force }
      Write-Log "   UCDS Web (fallback) rebuilt"
    } catch {
      Write-Log "   WARNING: UCDS Web (fallback) rebuild failed; the VPS copy is unaffected. $($_.Exception.Message)"
      if ((Get-Service "UCDS Web").Status -ne "Running") { Start-Service "UCDS Web" -ErrorAction SilentlyContinue }
    }
  }

  $state.failed = ""; $state.noted = ""; Save-State $state
  Write-Log "Done: $short is live"
} catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
