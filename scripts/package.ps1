$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "dist"))
$stageDirectory = [System.IO.Path]::GetFullPath((Join-Path $distDirectory "package"))

if (-not $distDirectory.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to package outside the project directory."
}

& (Join-Path $PSScriptRoot "generate-icons.ps1")
& (Join-Path $PSScriptRoot "test.ps1")

New-Item -ItemType Directory -Force -Path $distDirectory | Out-Null
if (Test-Path -LiteralPath $stageDirectory) {
    if (-not $stageDirectory.StartsWith($distDirectory, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clear an unexpected staging directory."
    }
    Remove-Item -LiteralPath $stageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageDirectory | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot "manifest.json") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot "background.js") -Destination $stageDirectory
Copy-Item -LiteralPath (Join-Path $projectRoot "src") -Destination $stageDirectory -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot "sidepanel") -Destination $stageDirectory -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $stageDirectory "icons") | Out-Null
Copy-Item -Path (Join-Path $projectRoot "icons\*.png") -Destination (Join-Path $stageDirectory "icons")
Copy-Item -LiteralPath (Join-Path $projectRoot "icons\icon-source.svg") -Destination (Join-Path $stageDirectory "icons")

$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json
$archivePath = Join-Path $distDirectory "PrismPath-v$($manifest.version).zip"
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $stageDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal

Write-Output "Created store package: $archivePath"
