param(
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'

$release = Join-Path $PSScriptRoot '../release'
if ($InstallerPath) {
  $installer = Get-Item -LiteralPath $InstallerPath -ErrorAction Stop
} else {
  $installers = @(Get-ChildItem -Path $release -Filter 'Image-Studio-Gallerie-*-x64.exe' -File)
  if ($installers.Count -ne 1) {
    throw "Atteso un unico installer NSIS in $release; trovati $($installers.Count)."
  }
  $installer = $installers[0]
}
if ($installer.Length -lt 10MB) { throw "Installer incompleto: $($installer.Length) byte." }

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$installDir = Join-Path $tempRoot 'ImageStudioGallerieSmoke'
$shortcut = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Image Studio Gallerie.lnk'
$startMenu = Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/Image Studio Gallerie.lnk'
if (Test-Path $installDir) { throw "La cartella di test esiste già: $installDir" }
$appExe = Join-Path $installDir 'Image Studio Gallerie.exe'
$uninstallExe = Join-Path $installDir 'Uninstall Image Studio Gallerie.exe'
$process = $null

try {
  # NSIS requires /D=<path> as the final argument.
  $install = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "Installazione fallita: exit code $($install.ExitCode)" }

  foreach ($file in @($appExe, $uninstallExe, $shortcut, $startMenu)) {
    if (-not (Test-Path $file)) { throw "Elemento assente dopo l'installazione: $file" }
  }

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $debugPort = $listener.LocalEndpoint.Port
  $listener.Stop()
  $process = Start-Process -FilePath $appExe -ArgumentList "--remote-debugging-port=$debugPort" -PassThru
  node (Join-Path $PSScriptRoot 'check-renderer.mjs') $debugPort
  $process.Refresh()
  if ($process.HasExited) { throw "L'app si è chiusa subito dopo l'avvio (exit code $($process.ExitCode))." }
  Write-Host 'Installazione, collegamenti e schermata di login: OK'
}
finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    Start-Sleep -Seconds 2
  }
  if (Test-Path $uninstallExe) {
    $uninstall = Start-Process -FilePath $uninstallExe -ArgumentList '/S' -PassThru -Wait
    if ($uninstall.ExitCode -ne 0) { throw "Disinstallazione fallita: exit code $($uninstall.ExitCode)" }
    Start-Sleep -Seconds 3
    if (Test-Path $appExe) { throw "L'eseguibile è ancora presente dopo la disinstallazione." }
    Write-Host 'Disinstallazione: OK'
  }
}