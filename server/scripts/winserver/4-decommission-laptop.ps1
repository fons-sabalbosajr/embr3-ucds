<#
.SYNOPSIS
  Run on the developer laptop once the Windows Server answers on the LAN
  address: stop advertising the route from here and drop the service rules.
  The laptop keeps Tailscale as an ordinary client (useful from home).
#>
$ErrorActionPreference = "Stop"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (Test-Path $ts) {
  & $ts set --advertise-routes=
  Write-Host "Route advertisement cleared. In the console remove tag:ucds-server from this machine (or delete the node)."
}
foreach ($name in @("UCDS Web", "UCDS API")) {
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
Write-Host "Firewall rules removed. Development servers still run locally on 5173/8081 for the laptop itself."
