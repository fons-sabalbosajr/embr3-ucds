<#
.SYNOPSIS
  Make this Windows Server the bridge to the office's private devices: the
  NAS and the legacy ERMS SQL Server. Run elevated on the office server
  after Tailscale is installed and signed in. Safe to run again.

.DESCRIPTION
  E-Universe on this server reaches both over the office LAN directly. The
  bridge is for E-Universe running anywhere else on the tailnet (the
  developer laptop off-site): this server advertises each device's single
  address into the tailnet, so that traffic arrives here over Tailscale and
  leaves on the LAN.

    NAS          10.14.76.167   port 445  (SMB)
    SQL Server   10.14.77.248   port 1433 (legacy ERMS databases)

  Only tag:ucds-server may use these routes, and only on those ports
  (docs/tailscale-policy.hujson). Neither device joins the tailnet, and
  neither port is ever exposed to the Internet.

  'tailscale set --advertise-routes' replaces the whole list, so both are
  always given together; a device that does not answer from here is left
  out with a warning rather than advertised.
#>
param(
  [string]$NasIp = "10.14.76.167",
  [string]$SqlIp = "10.14.77.248",
  [int]$SqlPort = 1433
)
$ErrorActionPreference = "Stop"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) { throw "Tailscale is not installed on this server." }

$routes = @()
foreach ($d in @(@{ Name = "NAS"; Ip = $NasIp; Port = 445 }, @{ Name = "SQL Server"; Ip = $SqlIp; Port = $SqlPort })) {
  Write-Host "== Can this server reach the $($d.Name) on the LAN? ($($d.Ip), port $($d.Port))"
  $t = Test-NetConnection $d.Ip -Port $d.Port -WarningAction SilentlyContinue
  if ($t.TcpTestSucceeded) {
    Write-Host "   answers"
    $routes += "$($d.Ip)/32"
  } else {
    Write-Warning "$($d.Name) at $($d.Ip) port $($d.Port) does not answer from this server. Not advertised. Check that the device is on, that its firewall allows this server, and (SQL Server) that TCP/IP is enabled on port $($d.Port)."
  }
}
if (-not $routes.Count) { throw "Nothing answered; no routes advertised." }

Write-Host "== Advertise into the tailnet: $($routes -join ', ')"
& $ts set --advertise-routes=($routes -join ',')

Write-Host "== Let tailnet peers ping this server (the application's bridge monitor)"
if (-not (Get-NetFirewallRule -DisplayName "UCDS bridge ping" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "UCDS bridge ping" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -RemoteAddress 100.64.0.0/10 -Profile Any -Action Allow | Out-Null
}

& $ts status
Write-Host ""
Write-Host "Now in https://login.tailscale.com/admin/machines : this server -> Edit route settings ->"
Write-Host "approve $($routes -join ' and '). The access rules must allow tag:ucds-server to each address and port."
