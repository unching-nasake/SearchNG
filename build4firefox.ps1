<#
.SYNOPSIS
    SearchNG Extension Build Script for Firefox
.DESCRIPTION
    Creates distribution package for Firefox (xpi) in the root directory.
#>

$ErrorActionPreference = "Stop"

$baseDir = Get-Location
$tempDir = Join-Path $baseDir "temp_build_firefox"

# Clean up temp
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Files to include
$includeItems = @("_locales", "css", "html", "icons", "js", "LICENSE", "README.md")

# Copy files
foreach ($item in $includeItems) {
  $srcPath = Join-Path $baseDir $item
  if (Test-Path $srcPath) {
    Copy-Item $srcPath $tempDir -Recurse
  }
}

# Handle Manifest
# Firefox requires the file to be named "manifest.json" inside the package
if (Test-Path (Join-Path $baseDir "manifest.firefox.json")) {
  Copy-Item (Join-Path $baseDir "manifest.firefox.json") (Join-Path $tempDir "manifest.json")
}
else {
  Write-Error "manifest.firefox.json not found."
}

# Compress (XPI is just a zip with a different extension)
# Note: Compress-Archive only supports .zip extension for the output file
$tempZip = Join-Path $baseDir "temp_firefox_package.zip"
$outputXpi = Join-Path $baseDir "searchng-firefox.xpi"

if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
if (Test-Path $outputXpi) { Remove-Item $outputXpi -Force }

Write-Host "Building for Firefox..." -ForegroundColor Cyan

# Use .NET ZipArchive to ensure standard zip structure with forward slashes
try {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stream = [System.IO.File]::OpenWrite($tempZip)
  $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)

  Get-ChildItem $tempDir -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $relPath = $_.FullName.Substring($tempDir.Length + 1).Replace("\", "/")
    $entry = $archive.CreateEntry($relPath)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($_.FullName)
    $fileStream.CopyTo($entryStream)
    $fileStream.Close()
    $entryStream.Close()
  }

  $archive.Dispose()
  $stream.Close()
}
catch {
  Write-Error $_
}

if (Test-Path $outputXpi) { Remove-Item $outputXpi -Force }
Move-Item -Path $tempZip -Destination $outputXpi
Write-Host "Created: $outputXpi" -ForegroundColor Green

# Cleanup
Remove-Item $tempDir -Recurse -Force

Write-Host "Build Complete!" -ForegroundColor Cyan
