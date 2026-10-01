<#
.SYNOPSIS
  Prepare a Windows Server 2019 host for E-Universe: folders, firewall, and
  the NAS host aliases. Run once, elevated, on the server.

.NOTES
  Nothing here touches credentials. The container passwords are entered
  through Developer Settings > Storage after the API is running, which stores
  them in the credential vault of the account the service runs as.
#>
param(
  # The LAN address this server answers on. Keep 10.14.76.122 if the DHCP
  # reservation moves from the laptop to this machine; otherwise every
  # ALLOWED_ORIGINS / VITE_API_BASE_URL and the tailnet policy change too.
  [string]$ServerIp = "10.14.76.122",
  # The Synology's LAN address, behind the per-container aliases.
  [string]$NasIp = "10.14.76.167",
  [string]$AppRoot = "C:\ucds\embr3-ucds"
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an elevated PowerShell."
}

Write-Host "== Folders"
New-Item -ItemType Directory -Force "$AppRoot" | Out-Null
New-Item -ItemType Directory -Force "C:\ucds\logs" | Out-Null

Write-Host "== Firewall (LAN and Tailscale profiles)"
foreach ($rule in @(@{Name="UCDS Web"; Port=5173}, @{Name="UCDS API"; Port=8081})) {
  if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Profile Any -Action Allow | Out-Null
    Write-Host "   added $($rule.Name) ($($rule.Port))"
  } else { Write-Host "   $($rule.Name) already present" }
}

Write-Host "== NAS host aliases (one Windows credential per server name)"
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$lines = Get-Content $hosts
foreach ($alias in @("records-nas", "legal-nas", "laboratory-nas", "cpd-nas")) {
  if ($lines -notmatch "\s$alias(\s|$)") {
    Add-Content $hosts "$NasIp`t$alias"
    Write-Host "   added $alias -> $NasIp"
  } else { Write-Host "   $alias already present" }
}

Write-Host "== Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Warning "Node.js is not installed. Install the current LTS from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS) and re-run."
} else { Write-Host "   $(node --version)" }

Write-Host "== Done. Next: 2-tailscale.ps1"
