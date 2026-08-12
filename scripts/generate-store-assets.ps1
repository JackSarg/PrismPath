$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$screenshotDirectory = Join-Path $projectRoot "store\screenshots"
$fixturePath = Join-Path $screenshotDirectory "fixture-highlight.png"
$generatedPanelPath = Join-Path $screenshotDirectory "sidepanel-generated.png"
$savedPanelPath = Join-Path $screenshotDirectory "sidepanel-saved.png"

foreach ($path in @($fixturePath, $generatedPanelPath, $savedPanelPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing integration screenshot: $path" }
}

Add-Type -AssemblyName System.Drawing

function New-CompositeScreenshot {
    param([string]$PanelPath, [string]$Destination)
    $fixture = [System.Drawing.Image]::FromFile($fixturePath)
    $panel = [System.Drawing.Image]::FromFile($PanelPath)
    $canvas = [System.Drawing.Bitmap]::new(1280, 800, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($fixture, 0, 0, 1280, 800)

    for ($offset = 30; $offset -ge 1; $offset--) {
        $alpha = [Math]::Max(1, [Math]::Round((31 - $offset) * 1.7))
        $shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb($alpha, 0, 7, 16))
        $graphics.FillRectangle($shadow, (860 - $offset), 0, 1, 800)
        $shadow.Dispose()
    }
    $graphics.DrawImage($panel, 860, 0, 420, 800)

    $canvas.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $canvas.Dispose()
    $panel.Dispose()
    $fixture.Dispose()
}

New-CompositeScreenshot -PanelPath $generatedPanelPath -Destination (Join-Path $screenshotDirectory "prismpath-generated-1280x800.png")
New-CompositeScreenshot -PanelPath $savedPanelPath -Destination (Join-Path $screenshotDirectory "prismpath-saved-1280x800.png")

$promo = [System.Drawing.Bitmap]::new(440, 280, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$promoGraphics = [System.Drawing.Graphics]::FromImage($promo)
$promoGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$promoGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$promoBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    ([System.Drawing.PointF]::new(0, 0)),
    ([System.Drawing.PointF]::new(440, 280)),
    [System.Drawing.Color]::FromArgb(255, 8, 31, 48),
    [System.Drawing.Color]::FromArgb(255, 5, 15, 27)
)
$promoGraphics.FillRectangle($promoBrush, 0, 0, 440, 280)

$accentPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(90, 37, 197, 220), 24)
$promoGraphics.DrawEllipse($accentPen, 310, -75, 190, 190)
$promoGraphics.DrawEllipse($accentPen, 360, 170, 120, 120)

$icon = [System.Drawing.Image]::FromFile((Join-Path $projectRoot "icons\icon-128.png"))
$promoGraphics.DrawImage($icon, 32, 38, 72, 72)
$titleFont = [System.Drawing.Font]::new("Segoe UI", 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = [System.Drawing.Font]::new("Segoe UI", 15, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new("Segoe UI", 11, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 241, 251, 255))
$mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 158, 189, 203))
$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 82, 221, 237))
$promoGraphics.DrawString("PrismPath", $titleFont, $whiteBrush, 122, 40)
$promoGraphics.DrawString("XPATH ASSISTANT", $labelFont, $accentBrush, 124, 76)
$promoGraphics.DrawString("Stable selectors for Blue Prism", $subtitleFont, $whiteBrush, 33, 142)
$promoGraphics.DrawString("Generate  |  Verify  |  Save  |  Retest", $subtitleFont, $mutedBrush, 33, 174)
$promoGraphics.DrawString("100% local - no analytics or network access", $labelFont, $accentBrush, 33, 222)
$promo.Save((Join-Path $projectRoot "store\promo-small-440x280.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$accentBrush.Dispose()
$mutedBrush.Dispose()
$whiteBrush.Dispose()
$labelFont.Dispose()
$subtitleFont.Dispose()
$titleFont.Dispose()
$icon.Dispose()
$accentPen.Dispose()
$promoBrush.Dispose()
$promoGraphics.Dispose()
$promo.Dispose()

Write-Output "Generated store screenshots and promotional tile."
