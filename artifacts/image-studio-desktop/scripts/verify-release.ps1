$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..'
$release = Join-Path $root 'release'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installers = @(Get-ChildItem $release -Filter 'Image-Studio-Gallerie-*-x64.exe' -File)
if ($installers.Count -ne 1) { throw "Expected exactly one Windows installer." }
$installer = $installers[0]
if ($installer.Name -cne "Image-Studio-Gallerie-$version-x64.exe" -or $installer.Length -lt 10MB) {
  throw "Installer missing, incomplete or not version $version."
}
$blockmap = Get-Item "$($installer.FullName).blockmap" -ErrorAction Stop
$metadata = Get-Item (Join-Path $release 'latest.yml') -ErrorAction Stop
if ($blockmap.Length -eq 0 -or $metadata.Length -eq 0) { throw "Empty update metadata." }
$text = Get-Content $metadata.FullName -Raw
$sha512 = [Convert]::ToBase64String([Security.Cryptography.SHA512]::HashData([IO.File]::ReadAllBytes($installer.FullName)))
if (-not $text.Contains($installer.Name) -or -not $text.Contains($sha512)) {
  throw "latest.yml does not refer to this installer and its SHA-512."
}

# The unpacked app exists only in the build job; the publish job downloads the
# checked artifacts without re-building the application.
$unpacked = Join-Path $release 'win-unpacked'
if (Test-Path $unpacked) {
  $appUpdate = Join-Path $unpacked 'resources/app-update.yml'
  $feed = Get-Content $appUpdate -Raw -ErrorAction Stop
  if (-not $feed.Contains('provider: github') -or
      -not $feed.Contains('owner: gennaromazza') -or
      -not $feed.Contains('repo: memoriesospese') -or
      $feed -match '(?m)^\s*publisherName:') {
    throw "The packaged app does not have the expected unsigned GitHub update feed."
  }
}

$zipPath = Join-Path $release "Image-Studio-Gallerie-$version-x64.zip"
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = @($archive.Entries)
  if ($entries.Count -ne 1 -or $entries[0].FullName -cne $installer.Name -or
      $entries[0].Length -ne $installer.Length) {
    throw "ZIP must contain exactly the matching installer."
  }
  $stream = $entries[0].Open()
  try {
    $zippedHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream))
  } finally {
    $stream.Dispose()
  }
  if ($zippedHash -cne (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash) {
    throw "ZIP installer does not match the standalone update installer."
  }
} finally {
  $archive.Dispose()
}

$files = @($installer.FullName, $blockmap.FullName, $metadata.FullName, $zipPath)
$hashes = $files | ForEach-Object {
  $hash = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $(Split-Path $_ -Leaf)"
}
$hashes | Set-Content (Join-Path $release 'SHA256SUMS.txt')
Write-Host "Verified Windows installer integrity and update metadata for $version (not code-signed)."