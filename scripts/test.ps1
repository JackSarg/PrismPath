$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

Write-Output "Validating manifest and runtime files"
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) { throw "manifest.json must use Manifest V3." }

$runtimeFiles = @(
    "background.js",
    "src/xpath-engine.js",
    "src/content-script.js",
    "sidepanel/index.html",
    "sidepanel/styles.css",
    "sidepanel/app.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png"
)
foreach ($relativePath in $runtimeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath))) {
        throw "Missing runtime file: $relativePath"
    }
}

Write-Output "Checking JavaScript syntax"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    foreach ($script in @("background.js", "src/xpath-engine.js", "src/content-script.js", "sidepanel/app.js")) {
        & $nodeCommand.Source --check (Join-Path $projectRoot $script)
        if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax check failed: $script" }
    }
} else {
    Write-Warning "Node.js is unavailable; JavaScript syntax-only checks were skipped."
}

$browserCandidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if (-not $browserCandidates.Count) {
    throw "Chrome or Edge is required to run DOM/XPath tests."
}

$browser = $browserCandidates[0]
$testPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "tests\engine.test.html"))
$testUrl = ([System.Uri]$testPath).AbsoluteUri
$profilePath = Join-Path $env:TEMP "prismpath-browser-tests-$PID"
New-Item -ItemType Directory -Force -Path $profilePath | Out-Null

Write-Output "Running XPath engine tests in $([System.IO.Path]::GetFileName($browser))"
$arguments = @(
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--user-data-dir=$profilePath",
    "--dump-dom",
    $testUrl
)
$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $browser
$startInfo.Arguments = ($arguments -join " ")
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
if (-not $process.Start()) { throw "Could not start the browser test process." }
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$output = $stdoutTask.Result
$browserErrors = $stderrTask.Result
if ($output -notmatch 'data-status="passed"') {
    Write-Output $output
    if ($browserErrors) { Write-Output $browserErrors }
    throw "Browser XPath engine tests failed."
}

$resultMatch = [regex]::Match($output, '<pre id="result" data-status="passed">(?<result>[\s\S]*?)</pre>')
if ($resultMatch.Success) {
    $decoded = [System.Net.WebUtility]::HtmlDecode($resultMatch.Groups["result"].Value)
    Write-Output $decoded.Trim()
}

$resolvedTemp = [System.IO.Path]::GetFullPath($env:TEMP)
$resolvedProfile = [System.IO.Path]::GetFullPath($profilePath)
if ($resolvedProfile.StartsWith($resolvedTemp, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedProfile)) {
    Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "All PrismPath checks passed."
