param(
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $projectRoot "icons"
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

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

foreach ($size in @(16, 32, 48, 128)) {
    $scale = 4
    $canvasSize = $size * $scale
    $bitmap = [System.Drawing.Bitmap]::new($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $padding = $canvasSize * 0.04
    $path = New-RoundedRectanglePath -X $padding -Y $padding -Width ($canvasSize - 2 * $padding) -Height ($canvasSize - 2 * $padding) -Radius ($canvasSize * 0.22)
    $gradientStart = [System.Drawing.PointF]::new(($canvasSize * 0.15), ($canvasSize * 0.08))
    $gradientEnd = [System.Drawing.PointF]::new(($canvasSize * 0.88), ($canvasSize * 0.94))
    $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $gradientStart,
        $gradientEnd,
        [System.Drawing.Color]::FromArgb(255, 18, 49, 74),
        [System.Drawing.Color]::FromArgb(255, 7, 20, 33)
    )
    $graphics.FillPath($background, $path)
    $border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 36, 75, 101), ($canvasSize * 0.032))
    $graphics.DrawPath($border, $path)

    $linePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 61, 211, 231), ($canvasSize * 0.075))
    $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $linePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLines($linePen, [System.Drawing.PointF[]]@(
        ([System.Drawing.PointF]::new(($canvasSize * 0.40), ($canvasSize * 0.25))),
        ([System.Drawing.PointF]::new(($canvasSize * 0.20), ($canvasSize * 0.50))),
        ([System.Drawing.PointF]::new(($canvasSize * 0.40), ($canvasSize * 0.75)))
    ))
    $graphics.DrawLines($linePen, [System.Drawing.PointF[]]@(
        ([System.Drawing.PointF]::new(($canvasSize * 0.60), ($canvasSize * 0.25))),
        ([System.Drawing.PointF]::new(($canvasSize * 0.80), ($canvasSize * 0.50))),
        ([System.Drawing.PointF]::new(($canvasSize * 0.60), ($canvasSize * 0.75)))
    ))

    $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 67, 213, 159))
    $dotOutline = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 234, 255, 255), ($canvasSize * 0.022))
    $dotSize = $canvasSize * 0.13
    $dotRect = [System.Drawing.RectangleF]::new((($canvasSize - $dotSize) / 2), (($canvasSize - $dotSize) / 2), $dotSize, $dotSize)
    $graphics.FillEllipse($dotBrush, $dotRect)
    $graphics.DrawEllipse($dotOutline, $dotRect)

    $finalBitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $finalGraphics = [System.Drawing.Graphics]::FromImage($finalBitmap)
    $finalGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $finalGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $finalGraphics.DrawImage($bitmap, 0, 0, $size, $size)
    $destination = Join-Path $resolvedOutput "icon-$size.png"
    $finalBitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)

    $finalGraphics.Dispose()
    $finalBitmap.Dispose()
    $dotOutline.Dispose()
    $dotBrush.Dispose()
    $linePen.Dispose()
    $border.Dispose()
    $background.Dispose()
    $path.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output "Generated PrismPath icons in $resolvedOutput"
