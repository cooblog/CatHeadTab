<#
.SYNOPSIS
Bump the frontend extension version and build the Chrome extension package.

.EXAMPLE
.\scripts\release-ext.ps1

Bumps patch version, syncs package-lock.json, then runs npm run build:ext.

.EXAMPLE
.\scripts\release-ext.ps1 -Type minor

Bumps minor version, syncs package-lock.json, then runs npm run build:ext.

.EXAMPLE
.\scripts\release-ext.ps1 -Type major -SkipBuild

Bumps major version and syncs package-lock.json without building the zip.
#>

[CmdletBinding()]
param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Type = 'patch',

  [switch]$SkipLockfile,

  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $PSCommandPath
$frontendDir = Resolve-Path (Join-Path $scriptDir '..')

function Invoke-ReleaseStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
}

Push-Location $frontendDir
try {
  Invoke-ReleaseStep "Bump version ($Type)" {
    & npm run bump -- $Type
  }

  if (-not $SkipLockfile) {
    Invoke-ReleaseStep "Sync package-lock.json" {
      & npm install --package-lock-only --ignore-scripts
    }
  }

  if (-not $SkipBuild) {
    Invoke-ReleaseStep "Build extension package" {
      & npm run build:ext
    }
  }

  $pkgPath = Join-Path $frontendDir 'package.json'
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  $version = $pkg.version
  $zipPath = Join-Path $frontendDir "catheadtab-v$version.zip"

  Write-Host ""
  Write-Host "Done. Version: $version" -ForegroundColor Green
  if (Test-Path $zipPath) {
    Write-Host "Package: $zipPath" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "Suggested commit:"
  Write-Host "  git add frontend/package.json frontend/package-lock.json frontend/public/manifest.json"
  Write-Host "  git commit -m `"chore: bump version to v$version`""
} finally {
  Pop-Location
}
