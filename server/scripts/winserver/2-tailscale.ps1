<#
.SYNOPSIS
  Make this Windows Server the E-Universe node on the tailnet: machine name
  ucds-server, connected whether or not anyone is signed in. Run elevated.
  Safe to run again.

.DESCRIPTION
  The VPS front door (server/scripts/vps/add-e-universe-site.sh) reaches
  E-Universe here, as ucds-server, on ports 5173 and 8081; the tailnet policy
  lets tag:ucds-proxy reach tag:ucds-server on those ports and nothing else.

  This server is usually already on the tailnet as the NAS bridge
  (emb3winsrvr2019, tag:nas-bridge, advertising 10.14.76.167/32 for the
  developer laptop off-site). That stays as it is: this script renames the
  machine and keeps it connected, and never touches the advertised route.
  'tailscale up' would require repeating every existing setting and drops
  the route if one is missed, so an existing node is changed with 'tailscale
  set' instead.

  DNS is left to Windows (--accept-dns=false): MongoDB Atlas is reached by a
  mongodb+srv lookup, which Tailscale's resolver has broken before
  (server/config/dns.js).
#>
param(
  [string]$Hostname = "ucds-server"
)

$ErrorActionPreference = "Stop"
$ts = "C:\Program Files\Tailscale\tailscale.exe"

if (-not (Test-Path $ts)) {
  Write-Host "== Installing Tailscale"
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements --silent
  } else {
    $msi = "$env:TEMP\tailscale-setup.msi"
    Invoke-WebRequest "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi" -OutFile $msi
    Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
  }
}

# Windows PowerShell 5.1 turns a native program's stderr into a terminating
# error under "Stop", even when redirected, so probes run under "Continue".
$ErrorActionPreference = "Continue"
& $ts status *> $null
$joined = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Stop"

if (-not $joined) {
  Write-Host "== Joining the tailnet as $Hostname (sign in as the tailnet's admin in the browser)"
  & $ts up --hostname=$Hostname --unattended --accept-dns=false
} else {
  Write-Host "== Already on the tailnet: renaming to $Hostname and staying connected unattended"
  & $ts set --hostname=$Hostname --accept-dns=false
  # "Run unattended": stays connected after sign-out and through reboots.
  $ErrorActionPreference = "Continue"
  & $ts set --unattended=true *> $null
  $unattendedOk = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = "Stop"
  if (-not $unattendedOk) {
    Write-Warning "This Tailscale version could not set unattended mode from the command line. In the Tailscale tray icon: Preferences > Run unattended."
  }
}

Write-Host ""
& $ts status
Write-Host ""
Write-Host "Advertised routes are unchanged:" (& $ts debug prefs | Select-String '"AdvertiseRoutes"' -Context 0,2 | Out-String).Trim()
Write-Host ""
Write-Host "Now in https://login.tailscale.com/admin/machines :"
Write-Host "  1. $Hostname -> Edit ACL tags -> add tag:ucds-server (keep tag:nas-bridge)"
Write-Host "  2. $Hostname -> confirm 'Key expiry: disabled'"
Write-Host "Next: 3-services.ps1"
