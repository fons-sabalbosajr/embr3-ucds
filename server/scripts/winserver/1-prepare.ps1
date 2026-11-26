<#
.SYNOPSIS
  Prepare the office Windows Server for E-Universe: folders, firewall, power
  settings for 24/7, and the NAS host aliases. Run once, elevated, on the
  server. Safe to run again.

.DESCRIPTION
  Staff reach E-Universe at https://e-universe.embr3-onlinesystems.cloud,
  through the VPS, which connects to this server over Tailscale. So the web
  (5173) and API (8081) ports only need to accept the tailnet's addresses
  (100.64.0.0/10): nobody on the office LAN or anywhere else can reach the
  plain-HTTP ports directly and bypass HTTPS. -AllowLan opens them to the LAN
  as well, for a LAN-only arrangement without the domain.

.NOTES
  Nothing here touches credentials. NAS passwords are kept, encrypted, in the
  database (Admin > Storage Configuration) and written into the Windows vault
  of the service account by the API itself, on every start and on every save.
#>
param(
  # The Synology's LAN address, behind the per-container aliases.
  [string]$NasIp = "10.14.76.167",
  [string]$AppRoot = "C:\ucds\embr3-ucds",
  # Also accept the web and API ports from the office LAN (old arrangement).
  [switch]$AllowLan
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this from an elevated PowerShell."
}

Write-Host "== Folders"
New-Item -ItemType Directory -Force "$AppRoot" | Out-Null
New-Item -ItemType Directory -Force "C:\ucds\logs" | Out-Null

$remote = @("100.64.0.0/10")              # the tailnet: the VPS front door
if ($AllowLan) { $remote += "LocalSubnet" }
Write-Host "== Firewall: 5173 and 8081 from $($remote -join ', ') only"
foreach ($rule in @(@{Name="UCDS Web"; Port=5173}, @{Name="UCDS API"; Port=8081})) {
  $existing = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if ($existing) {
    # Converge an older, open rule onto the narrower one.
    $existing | Set-NetFirewallRule -RemoteAddress $remote -Profile Any -Action Allow -Enabled True
    Write-Host "   $($rule.Name) ($($rule.Port)) updated"
  } else {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port `
      -RemoteAddress $remote -Profile Any -Action Allow | Out-Null
    Write-Host "   $($rule.Name) ($($rule.Port)) added"
  }
}

Write-Host "== Power: never sleep or hibernate (E-Universe runs 24/7)"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 15 | Out-Null
powercfg /hibernate off 2>$null | Out-Null
Write-Host "   done. In the BIOS/UEFI, also set 'Restore on AC power loss' to 'Power On'."

Write-Host "== NAS host aliases (one Windows credential per server name)"
$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$text = [IO.File]::ReadAllText($hosts)
$added = @()
foreach ($alias in @("records-nas", "legal-nas", "laboratory-nas", "cpd-nas")) {
  if ($text -notmatch "(?m)^\s*\d+\.\d+\.\d+\.\d+\s+$([regex]::Escape($alias))(\s|$)") { $added += "$NasIp`t$alias" }
}
if ($added.Count) {
  # Start on a fresh line even if the file does not end with one.
  $prefix = if ($text.Length -and -not $text.EndsWith("`n")) { "`r`n" } else { "" }
  [IO.File]::AppendAllText($hosts, $prefix + "# E-Universe NAS share aliases`r`n" + ($added -join "`r`n") + "`r`n")
  Write-Host "   added: $($added -replace "`t", ' -> ' -join ', ')"
} else { Write-Host "   all present" }

Write-Host "== Can this server reach the NAS on the LAN?"
$t = Test-NetConnection $NasIp -Port 445 -WarningAction SilentlyContinue
if ($t.TcpTestSucceeded) { Write-Host "   $NasIp`:445 answers" } else { Write-Warning "$NasIp`:445 does not answer from here. Check the LAN before going further." }

Write-Host "== Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Warning "Node.js is not installed. Install the LTS (winget install OpenJS.NodeJS.LTS), open a new PowerShell, and re-run."
} else { Write-Host "   $(node --version)" }

Write-Host "== Done. Next: 2-tailscale.ps1"
