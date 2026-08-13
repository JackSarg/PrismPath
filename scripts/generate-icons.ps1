param(
    [string]$OutputDirectory = "",
    [string]$StoreDirectory = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectRoot "icons"
}
if (-not $StoreDirectory) {
    $StoreDirectory = Join-Path $projectRoot "store"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
$resolvedStore = [System.IO.Path]::GetFullPath($StoreDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null
New-Item -ItemType Directory -Force -Path $resolvedStore | Out-Null

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-PrismPathLogo {
    param(
        [int]$Size,
        [double]$PaddingRatio,
        [bool]$IncludeFacets
    )

    $scale = if ($Size -le 32) { 8 } else { 4 }
    $canvasSize = $Size * $scale
    $bitmap = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $padding = [float]($canvasSize * $PaddingRatio)
    $tileSize = [float]($canvasSize - 2 * $padding)
    $centre = [float]($canvasSize / 2)
    $tilePath = New-RoundedRectanglePath -X $padding -Y $padding -Width $tileSize -Height $tileSize -Radius ($tileSize * 0.23)
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        ([System.Drawing.PointF]::new(($padding + $tileSize * 0.12), ($padding + $tileSize * 0.06))),
        ([System.Drawing.PointF]::new(($padding + $tileSize * 0.88), ($padding + $tileSize * 0.94))),
        [System.Drawing.Color]::FromArgb(255, 18, 49, 74),
        [System.Drawing.Color]::FromArgb(255, 7, 20, 33)
    )
    $graphics.FillPath($background, $tilePath)
    $border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 36, 75, 101), [Math]::Max(1, $tileSize * 0.03))
    $graphics.DrawPath($border, $tilePath)

    $diamondRadius = [float]($tileSize * 0.385)
    $diamondPoints = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($centre, ($centre - $diamondRadius)),
        [System.Drawing.PointF]::new(($centre + $diamondRadius), $centre),
        [System.Drawing.PointF]::new($centre, ($centre + $diamondRadius)),
        [System.Drawing.PointF]::new(($centre - $diamondRadius), $centre)
    )

    if ($IncludeFacets) {
        $facetInset = [float]($tileSize * 0.19)
        $topLeftFacet = [System.Drawing.PointF[]]@(
            $diamondPoints[0],
            $diamondPoints[3],
            [System.Drawing.PointF]::new(($centre - $facetInset * 0.58), $centre),
            [System.Drawing.PointF]::new($centre, ($centre - $facetInset))
        )
        $topRightFacet = [System.Drawing.PointF[]]@(
            $diamondPoints[0],
            $diamondPoints[1],
            [System.Drawing.PointF]::new(($centre + $facetInset * 0.58), $centre),
            [System.Drawing.PointF]::new($centre, ($centre - $facetInset))
        )
        $bottomLeftFacet = [System.Drawing.PointF[]]@(
            $diamondPoints[3],
            $diamondPoints[2],
            [System.Drawing.PointF]::new($centre, ($centre + $facetInset)),
            [System.Drawing.PointF]::new(($centre - $facetInset * 0.58), $centre)
        )
        $bottomRightFacet = [System.Drawing.PointF[]]@(
            $diamondPoints[1],
            $diamondPoints[2],
            [System.Drawing.PointF]::new($centre, ($centre + $facetInset)),
            [System.Drawing.PointF]::new(($centre + $facetInset * 0.58), $centre)
        )
        $facetBrushes = @(
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(142, 27, 108, 158)),
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(72, 49, 204, 227)),
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(184, 18, 74, 115)),
            [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(112, 28, 136, 177))
        )
        $graphics.FillPolygon($facetBrushes[0], $topLeftFacet)
        $graphics.FillPolygon($facetBrushes[1], $topRightFacet)
        $graphics.FillPolygon($facetBrushes[2], $bottomLeftFacet)
        $graphics.FillPolygon($facetBrushes[3], $bottomRightFacet)
        foreach ($brush in $facetBrushes) { $brush.Dispose() }
    }

    $diamondGradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        ([System.Drawing.PointF]::new(($centre - $diamondRadius), ($centre - $diamondRadius))),
        ([System.Drawing.PointF]::new(($centre + $diamondRadius), ($centre + $diamondRadius))),
        [System.Drawing.Color]::FromArgb(255, 99, 227, 242),
        [System.Drawing.Color]::FromArgb(255, 24, 183, 210)
    )
    $diamondPen = [System.Drawing.Pen]::new($diamondGradient, [Math]::Max(1.4, $tileSize * 0.06))
    $diamondPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPolygon($diamondPen, $diamondPoints)

    $ringRadius = [float]($tileSize * 0.205)
    $ringRect = [System.Drawing.RectangleF]::new(($centre - $ringRadius), ($centre - $ringRadius), ($ringRadius * 2), ($ringRadius * 2))
    $ringFill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 8, 23, 37))
    $graphics.FillEllipse($ringFill, $ringRect)
    $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 243, 251, 255), [Math]::Max(1, $tileSize * 0.048))
    $graphics.DrawEllipse($ringPen, $ringRect)

    if ($Size -ge 32) {
        $tickPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 243, 251, 255), [Math]::Max(1, $tileSize * 0.036))
        $tickPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tickPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $tickInner = $ringRadius * 0.72
        $tickOuter = $ringRadius * 1.28
        $graphics.DrawLine($tickPen, $centre, ($centre - $tickOuter), $centre, ($centre - $tickInner))
        $graphics.DrawLine($tickPen, $centre, ($centre + $tickInner), $centre, ($centre + $tickOuter))
        $graphics.DrawLine($tickPen, ($centre - $tickOuter), $centre, ($centre - $tickInner), $centre)
        $graphics.DrawLine($tickPen, ($centre + $tickInner), $centre, ($centre + $tickOuter), $centre)
        $tickPen.Dispose()
    }

    $nodeSize = [float]($tileSize * 0.16)
    $nodeRect = [System.Drawing.RectangleF]::new(($centre - $nodeSize / 2), ($centre - $nodeSize / 2), $nodeSize, $nodeSize)
    $nodeGradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        ([System.Drawing.PointF]::new(($centre - $nodeSize / 2), ($centre - $nodeSize / 2))),
        ([System.Drawing.PointF]::new(($centre + $nodeSize / 2), ($centre + $nodeSize / 2))),
        [System.Drawing.Color]::FromArgb(255, 121, 237, 190),
        [System.Drawing.Color]::FromArgb(255, 67, 213, 159)
    )
    $nodeOutline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 234, 255, 255), [Math]::Max(0.8, $tileSize * 0.017))
    $graphics.FillEllipse($nodeGradient, $nodeRect)
    $graphics.DrawEllipse($nodeOutline, $nodeRect)

    $finalBitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $finalGraphics = [System.Drawing.Graphics]::FromImage($finalBitmap)
    $finalGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $finalGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $finalGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $finalGraphics.DrawImage($bitmap, 0, 0, $Size, $Size)

    $nodeOutline.Dispose()
    $nodeGradient.Dispose()
    $ringPen.Dispose()
    $ringFill.Dispose()
    $diamondPen.Dispose()
    $diamondGradient.Dispose()
    $border.Dispose()
    $background.Dispose()
    $tilePath.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()

    return $finalBitmap
}

foreach ($size in @(16, 32, 48, 128)) {
    $paddingRatio = if ($size -eq 128) { 0.125 } else { 0.045 }
    $bitmap = New-PrismPathLogo -Size $size -PaddingRatio $paddingRatio -IncludeFacets ($size -ge 48)
    $destination = Join-Path $resolvedOutput "icon-$size.png"
    $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

$storeLogo = New-PrismPathLogo -Size 300 -PaddingRatio 0.06 -IncludeFacets $true
$storeLogo.Save((Join-Path $resolvedStore "logo-300x300.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$storeLogo.Dispose()

Write-Output "Generated PrismPath runtime icons in $resolvedOutput"
Write-Output "Generated PrismPath 300px Edge listing logo in $resolvedStore"
