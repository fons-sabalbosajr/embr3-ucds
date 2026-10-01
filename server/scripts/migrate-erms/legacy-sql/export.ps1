<#
.SYNOPSIS
  Export the three legacy ERMS SQL Server databases to JSON lines.

.DESCRIPTION
  The desktop ERMS kept its data in three SQL Server databases, one per unit,
  exported as .bacpac packages in data/erms_sql:

      dbmain_ermsrecords   Records Unit   ECC / CNC / HW permits (tb_maindata)
      dbmain_ermslegal     Legal Unit     NOV, technical conference, order/
                                          resolution, payment records
      dbmain_ermssublab    Laboratory     test results, chain of custody, memos

  A .bacpac is a zip of schema (model.xml) plus one binary BCP file per
  table. Rather than parse BCP by hand this imports each package into the
  local SQL Server LocalDB instance with SqlPackage, then reads every table
  through SqlClient and writes one JSON object per line to

      data/erms_sql/export/<records|legal|laboratory>/<table>.jsonl

  which scripts/migrate-erms/legacy-sql/load.js loads into MongoDB.

  Columns that hold secrets or binaries are never exported: Password, Photo.
  Everything else is exported as it is stored — every column in these
  databases is varchar, dates included, so nothing is interpreted here.

.PARAMETER Import
  Also (re)import the .bacpac files into LocalDB first. Needs SqlPackage
  (`dotnet tool install -g microsoft.sqlpackage`) and .NET; the tool targets
  .NET 8 and runs on a newer runtime with DOTNET_ROLL_FORWARD=Major.

.EXAMPLE
  .\export.ps1 -Import
  node ..\..\migrate-erms\legacy-sql\load.js
#>
param(
  [switch]$Import,
  [string]$Server = "(localdb)\MSSQLLocalDB",
  [string]$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\data\erms_sql")).Path,
  [string]$OutDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..\data\erms_sql")).Path "export")
)
$ErrorActionPreference = "Stop"

$DATABASES = @(
  @{ db = "dbmain_ermsrecords"; unit = "records" },
  @{ db = "dbmain_ermslegal";   unit = "legal" },
  @{ db = "dbmain_ermssublab";  unit = "laboratory" }
)
$EXCLUDED_COLUMNS = @("Password", "Photo")

if ($Import) {
  $env:PATH += ";$env:USERPROFILE\.dotnet\tools"
  $env:DOTNET_ROLL_FORWARD = "Major"
  if (-not (Get-Command sqlpackage -ErrorAction SilentlyContinue)) {
    throw "SqlPackage not found. Install it with: dotnet tool install -g microsoft.sqlpackage"
  }
  sqllocaldb start MSSQLLocalDB | Out-Null
  foreach ($d in $DATABASES) {
    $bacpac = Join-Path $SourceDir "$($d.db).bacpac"
    if (-not (Test-Path $bacpac)) { throw "Missing $bacpac" }
    Write-Host "== importing $($d.db)"
    $drop = "IF DB_ID('$($d.db)') IS NOT NULL BEGIN ALTER DATABASE [$($d.db)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$($d.db)]; END"
    $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=master;Integrated Security=true")
    $cn.Open(); $c = $cn.CreateCommand(); $c.CommandText = $drop; [void]$c.ExecuteNonQuery(); $cn.Close()
    sqlpackage /a:Import /sf:"$bacpac" /tsn:"$Server" /tdn:"$($d.db)" /p:CommandTimeout=600 | Select-Object -Last 2
  }
}

New-Item -ItemType Directory -Force $OutDir | Out-Null
$summary = @()

foreach ($d in $DATABASES) {
  $dir = Join-Path $OutDir $d.unit
  New-Item -ItemType Directory -Force $dir | Out-Null
  $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$Server;Database=$($d.db);Integrated Security=true")
  $cn.Open()

  $tables = @()
  $cmd = $cn.CreateCommand()
  $cmd.CommandText = "SELECT name FROM sys.tables ORDER BY name"
  $r = $cmd.ExecuteReader(); while ($r.Read()) { $tables += $r.GetString(0) }; $r.Close()

  foreach ($table in $tables) {
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = "SELECT * FROM [dbo].[$table]"
    $cmd.CommandTimeout = 300
    $r = $cmd.ExecuteReader()
    $names = @(); $keep = @()
    for ($i = 0; $i -lt $r.FieldCount; $i++) {
      $n = $r.GetName($i)
      if ($EXCLUDED_COLUMNS -contains $n) { continue }
      $names += $n; $keep += $i
    }
    $file = Join-Path $dir "$table.jsonl"
    $w = New-Object System.IO.StreamWriter($file, $false, (New-Object System.Text.UTF8Encoding($false)))
    $rows = 0
    while ($r.Read()) {
      $o = [ordered]@{}
      for ($k = 0; $k -lt $keep.Count; $k++) {
        $v = $r.GetValue($keep[$k])
        if ($v -is [DBNull]) { $o[$names[$k]] = $null }
        elseif ($v -is [byte[]]) { $o[$names[$k]] = [Convert]::ToBase64String($v) }
        else { $o[$names[$k]] = $v }
      }
      $w.WriteLine(($o | ConvertTo-Json -Compress -Depth 2))
      $rows++
    }
    $r.Close(); $w.Close()
    $summary += [pscustomobject]@{ unit = $d.unit; table = $table; rows = $rows; columns = ($names -join ",") }
    Write-Host ("  {0,-12} {1,-32} {2,7} rows" -f $d.unit, $table, $rows)
  }
  $cn.Close()
}

$summary | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 (Join-Path $OutDir "manifest.json")
Write-Host "Wrote $($summary.Count) tables to $OutDir"
