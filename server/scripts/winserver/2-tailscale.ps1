<#
.SYNOPSIS
  Join the Windows Server to the tailnet as the E-Universe server node and
  advertise its own LAN address, replacing the laptop. Run elevated.

.DESCRIPTION
  The server advertises only its own /32. The NAS is never advertised and
  port 445 never leaves the LAN; staff use the application, the application
  uses the NAS. See docs/WINSERVER-MIGRATION.md.

  Sign-in opens a browser page: log in as emb.idms@gmail.com. Afterwards, in
  the console: Machines -> this server -> Edit ACL tags -> tag:ucds-server,
  Disable key expiry, and confirm "Subnets: <ServerIp>/32" is approved
  (autoApprovers in the policy approves it for tag:ucds-server).
#>
param(
  [string]$ServerIp = "10.14.76.122",
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

Write-Host "== Joining the tailnet as $Hostname, advertising $ServerIp/32"
& $ts up --hostname=$Hostname --advertise-routes="$ServerIp/32" --accept-dns=false
& $ts status

Write-Host ""
Write-Host "Now in https://login.tailscale.com/admin/machines :"
Write-Host "  1. $Hostname -> Edit ACL tags -> tag:ucds-server"
Write-Host "  2. $Hostname -> Disable key expiry"
Write-Host "  3. Confirm Subnets: $ServerIp/32 shows no 'pending approval'"
Write-Host "  4. The old node (laptop-h95ad936): remove its tag and route, or delete it"
Write-Host "Next: 3-services.ps1"
