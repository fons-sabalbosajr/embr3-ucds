<#
.SYNOPSIS
  Run update.ps1 every few minutes, so a release (a version tag on GitHub's
  main that passed CI) reaches the office server's API without anyone
  signing in here.

.DESCRIPTION
  Registers the scheduled task "E-Universe update", running as SYSTEM (it
  restarts the "UCDS API" service and writes in the checkout), every
  -Minutes minutes, with no overlap. update.ps1 does nothing and logs nothing
  when there is no new commit, so the frequent schedule costs one git fetch.

  The machine is never reached from outside: it asks GitHub, GitHub never
  asks it. See server/scripts/CI-CD.md.

  -Uninstall removes the task; updates then go back to the manual steps in
  README.md ("Updating E-Universe").
#>
param(
  [string]$AppRoot = "C:\ucds\embr3-ucds",
  [int]$Minutes = 3,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$TaskName = "E-Universe update"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed the task '$TaskName'."
  exit 0
}

$script = Join-Path $AppRoot "server\scripts\winserver\update.ps1"
if (-not (Test-Path $script)) { throw "update.ps1 not found at $script. git pull first." }
foreach ($cmd in @("git", "npm.cmd", "node")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "$cmd is not on PATH." }
}
# SYSTEM sees the machine PATH only. Node and Git install there; check, since
# a per-user install would leave the task unable to find them.
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
foreach ($cmd in @("git", "node")) {
  $dir = Split-Path (Get-Command $cmd).Source
  if ($machinePath -notlike "*$dir*") { Write-Warning "$cmd ($dir) is not on the machine PATH; the task, running as SYSTEM, will not find it." }
}
if (-not (Get-Service "UCDS API" -ErrorAction SilentlyContinue)) { throw "The 'UCDS API' service is not installed. Run 3-services.ps1 first." }

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`" -AppRoot `"$AppRoot`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "Takes the newest E-Universe release tag from GitHub once CI passes and restarts the API (server/scripts/winserver/update.ps1)." -Force | Out-Null

Write-Host "Registered '$TaskName': every $Minutes minutes, as SYSTEM."
Write-Host "Log: C:\ucds\logs\update.log   Run now: Start-ScheduledTask '$TaskName'"
