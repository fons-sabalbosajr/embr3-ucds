<#
.SYNOPSIS
  Install E-Universe as two Windows services with NSSM so it starts with the
  server and survives the weekly power cycle without anyone signing in.

.DESCRIPTION
  UCDS API  node server.js            port 8081
  UCDS Web  vite preview --host       port 5173 (the built front-end)

  Both run as the account given in -ServiceUser. That account owns the NAS
  credentials in its Windows vault. Nobody has to enter them there: every time
  the API starts it copies the passwords saved in Admin > Storage
  Configuration into this account's vault (nasContainers.syncToWindows), and a
  password changed there is written at once. This needs the same
  CONFIG_ENCRYPTION_KEY in server/.env as the machine that saved them.

  Prerequisites: the repository at -AppRoot with server/.env filled in,
  `npm ci` run in server/ and front-end/, `npm run build` run in front-end/,
  and NSSM (https://nssm.cc, or: winget install NSSM.NSSM) on PATH.
#>
param(
  [string]$AppRoot = "C:\ucds\embr3-ucds",
  # A dedicated local account, not Administrator. Created here if missing.
  [string]$ServiceUser = "ucds-svc",
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
# nssm complains on stderr about a service that is already stopped; Windows
# PowerShell 5.1 would turn that into a terminating error under "Stop".
function Invoke-Quiet([scriptblock]$block) {
  $ErrorActionPreference = "Continue"
  & $block *> $null
}
$nssm =(Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssm) { throw "NSSM not found. Install it (winget install NSSM.NSSM) and re-run." }
$node = (Get-Command node -ErrorAction Stop).Source
# vite is started by node directly rather than through npx.cmd: a service
# wrapped in cmd.exe can leave node running when the service is stopped.
$vite = Join-Path $AppRoot "front-end\node_modules\vite\bin\vite.js"
if (-not (Test-Path $vite)) { throw "vite not found at $vite. Run 'npm ci' in front-end first." }
if (-not (Test-Path (Join-Path $AppRoot "front-end\dist\index.html"))) { throw "No build in front-end\dist. Run 'npm run build' in front-end first." }

if ($Uninstall) {
  foreach ($svc in @("UCDS API", "UCDS Web")) {
    Invoke-Quiet { & $nssm stop $svc }
    & $nssm remove $svc confirm
  }
  Write-Host "Removed."
  exit 0
}

if (-not (Get-LocalUser -Name $ServiceUser -ErrorAction SilentlyContinue)) {
  $pw = Read-Host -AsSecureString "Password for the new local service account '$ServiceUser'"
  New-LocalUser -Name $ServiceUser -Password $pw -PasswordNeverExpires -Description "E-Universe service account" | Out-Null
  Write-Host "Created $ServiceUser. Grant it 'Log on as a service' (secpol.msc) if NSSM does not."
} else {
  $pw = Read-Host -AsSecureString "Password of '$ServiceUser' (needed to register the services)"
}
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))

# The service account must read the repository and write logs and uploads.
icacls "$AppRoot" /grant "${ServiceUser}:(OI)(CI)M" /T | Out-Null
icacls "C:\ucds\logs" /grant "${ServiceUser}:(OI)(CI)M" | Out-Null

# Not $args: that is PowerShell's automatic variable.
function Install-Svc($name, $dir, $exe, $arguments, $log) {
  if (Get-Service $name -ErrorAction SilentlyContinue) { Invoke-Quiet { & $nssm stop $name }; & $nssm remove $name confirm }
  & $nssm install $name $exe $arguments
  & $nssm set $name AppDirectory $dir
  & $nssm set $name AppStdout "C:\ucds\logs\$log.out.log"
  & $nssm set $name AppStderr "C:\ucds\logs\$log.err.log"
  & $nssm set $name AppRotateFiles 1
  & $nssm set $name AppRotateBytes 10485760
  & $nssm set $name AppEnvironmentExtra "NODE_ENV=production"
  & $nssm set $name Start SERVICE_AUTO_START
  & $nssm set $name AppExit Default Restart
  & $nssm set $name AppRestartDelay 5000
  & $nssm set $name ObjectName ".\$ServiceUser" $plain
  & $nssm start $name
  Write-Host "   $name installed and started"
}

Write-Host "== Services"
Install-Svc "UCDS API" "$AppRoot\server" $node "server.js" "api"
Install-Svc "UCDS Web" "$AppRoot\front-end" $node "`"$vite`" preview --host --port 5173 --strictPort" "web"

Write-Host ""
Write-Host "Check: http://localhost:8081/healthz  and  http://localhost:5173"
Write-Host "C:\ucds\logs\api.out.log should show: [NAS] Windows credentials restored: records, legal, laboratory"
Write-Host "Then on the VPS: bash add-e-universe-site.sh ucds-server"
