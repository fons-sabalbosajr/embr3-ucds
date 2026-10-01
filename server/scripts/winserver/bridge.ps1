<#
.SYNOPSIS
  Make this Windows Server the NAS bridge: advertise the NAS's LAN address
  into the tailnet and let the application's monitor ping it. Run elevated
  on the server (emb3winsrvr2019) after Tailscale is installed and signed in.

.DESCRIPTION
  The application (wherever it runs, on the tailnet) opens SMB to the NAS at
  10.14.76.167. This server advertises 10.14.76.167/32, so that traffic
  arrives here over the tailnet and leaves on the office LAN. Only the
  application's node may use it (docs/tailscale-policy.hujson); the NAS is
  never on the tailnet and 445 is never exposed to the Internet.
#>
param(
  [string]$NasIp = "10.14.76.167"
)
$ErrorActionPreference = "Stop"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) { throw "Tailscale is not installed on this server." }

Write-Host "== Can this server reach the NAS on the LAN?"
$t = Test-NetConnection $NasIp -Port 445 -WarningAction SilentlyContinue
if (-not $t.TcpTestSucceeded) { throw "This server cannot open $NasIp:445. Fix the LAN route first; the bridge is pointless otherwise." }
Write-Host "   $NasIp:445 answers"

Write-Host "== Advertise the NAS route into the tailnet"
& $ts set --advertise-routes="$NasIp/32"

Write-Host "== Let tailnet peers ping this server (the application's bridge monitor)"
if (-not (Get-NetFirewallRule -DisplayName "UCDS bridge ping" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "UCDS bridge ping" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -RemoteAddress 100.64.0.0/10 -Profile Any -Action Allow | Out-Null
}

& $ts status
Write-Host ""
Write-Host "In https://login.tailscale.com/admin/machines : this server -> Edit ACL tags -> tag:nas-bridge; Disable key expiry;"
Write-Host "confirm 'Subnets: $NasIp/32' is approved. Then in E-Universe: Storage > Availability > Bridge server -> address 100.126.200.112, switch on, Check now."
