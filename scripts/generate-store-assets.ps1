$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$storeDirectory = Join-Path $projectRoot "store"
$screenshotDirectory = Join-Path $storeDirectory "screenshots"
$edgeLogoPath = Join-Path $storeDirectory "logo-300x300.png"
$fixturePath = Join-Path $screenshotDirectory "fixture-highlight.png"
$generatedPanelPath = Join-Path $screenshotDirectory "sidepanel-generated.png"
$savedPanelPath = Join-Path $screenshotDirectory "sidepanel-saved.png"

& (Join-Path $PSScriptRoot "generate-icons.ps1")

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

$generatedScreenshot = Join-Path $screenshotDirectory "prismpath-generated-1280x800.png"
$savedScreenshot = Join-Path $screenshotDirectory "prismpath-saved-1280x800.png"
New-CompositeScreenshot -PanelPath $generatedPanelPath -Destination $generatedScreenshot
New-CompositeScreenshot -PanelPath $savedPanelPath -Destination $savedScreenshot

$smallPromoPath = Join-Path $storeDirectory "promo-small-440x280.png"
$promo = [System.Drawing.Bitmap]::new(440, 280, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$promoGraphics = [System.Drawing.Graphics]::FromImage($promo)
$promoGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$promoGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
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

$storeLogo = [System.Drawing.Image]::FromFile($edgeLogoPath)
$promoGraphics.DrawImage($storeLogo, 24, 27, 92, 92)
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
$promoGraphics.DrawString("Local by design - no analytics", $labelFont, $accentBrush, 33, 222)
$promo.Save($smallPromoPath, [System.Drawing.Imaging.ImageFormat]::Png)

$accentBrush.Dispose()
$mutedBrush.Dispose()
$whiteBrush.Dispose()
$labelFont.Dispose()
$subtitleFont.Dispose()
$titleFont.Dispose()
$accentPen.Dispose()
$promoBrush.Dispose()
$promoGraphics.Dispose()
$promo.Dispose()

$marqueePath = Join-Path $storeDirectory "promo-marquee-1400x560.png"
$marquee = [System.Drawing.Bitmap]::new(1400, 560, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$marqueeGraphics = [System.Drawing.Graphics]::FromImage($marquee)
$marqueeGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$marqueeGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$marqueeGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$marqueeBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    ([System.Drawing.PointF]::new(0, 0)),
    ([System.Drawing.PointF]::new(1400, 560)),
    [System.Drawing.Color]::FromArgb(255, 8, 36, 54),
    [System.Drawing.Color]::FromArgb(255, 4, 14, 26)
)
$marqueeGraphics.FillRectangle($marqueeBrush, 0, 0, 1400, 560)

$largeAccentPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(62, 37, 197, 220), 40)
$marqueeGraphics.DrawEllipse($largeAccentPen, 1060, -260, 560, 560)
$marqueeGraphics.DrawEllipse($largeAccentPen, 1180, 390, 250, 250)
$marqueeGraphics.DrawImage($storeLogo, 92, 95, 370, 370)

$marqueeTitleFont = [System.Drawing.Font]::new("Segoe UI", 58, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$marqueeLabelFont = [System.Drawing.Font]::new("Segoe UI", 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$marqueeSubtitleFont = [System.Drawing.Font]::new("Segoe UI", 29, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$marqueeFeatureFont = [System.Drawing.Font]::new("Segoe UI", 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 241, 251, 255))
$accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 82, 221, 237))
$mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 158, 189, 203))
$marqueeGraphics.DrawString("PrismPath", $marqueeTitleFont, $whiteBrush, 515, 130)
$marqueeGraphics.DrawString("XPATH ASSISTANT", $marqueeLabelFont, $accentBrush, 521, 204)
$marqueeGraphics.DrawString("Stable selectors for Blue Prism automation", $marqueeSubtitleFont, $whiteBrush, 515, 275)
$marqueeGraphics.DrawString("Generate   |   Verify   |   Save   |   Retest", $marqueeFeatureFont, $mutedBrush, 518, 337)
$marquee.Save($marqueePath, [System.Drawing.Imaging.ImageFormat]::Png)

$mutedBrush.Dispose()
$accentBrush.Dispose()
$whiteBrush.Dispose()
$marqueeFeatureFont.Dispose()
$marqueeSubtitleFont.Dispose()
$marqueeLabelFont.Dispose()
$marqueeTitleFont.Dispose()
$largeAccentPen.Dispose()
$marqueeBrush.Dispose()
$marqueeGraphics.Dispose()
$marquee.Dispose()
$storeLogo.Dispose()

function Assert-ImageSize {
    param([string]$Path, [int]$Width, [int]$Height)
    $image = [System.Drawing.Image]::FromFile($Path)
    try {
        if ($image.Width -ne $Width -or $image.Height -ne $Height) {
            throw "Unexpected dimensions for $Path`: $($image.Width)x$($image.Height); expected ${Width}x${Height}."
        }
    } finally {
        $image.Dispose()
    }
}

foreach ($specification in @(
    @((Join-Path $projectRoot "icons\icon-16.png"), 16, 16),
    @((Join-Path $projectRoot "icons\icon-32.png"), 32, 32),
    @((Join-Path $projectRoot "icons\icon-48.png"), 48, 48),
    @((Join-Path $projectRoot "icons\icon-128.png"), 128, 128),
    @($edgeLogoPath, 300, 300),
    @($smallPromoPath, 440, 280),
    @($marqueePath, 1400, 560),
    @($generatedScreenshot, 1280, 800),
    @($savedScreenshot, 1280, 800)
)) {
    Assert-ImageSize -Path $specification[0] -Width $specification[1] -Height $specification[2]
}

Write-Output "Generated and verified the canonical PrismPath store artwork in $storeDirectory"
