Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-RoundedRectPath {
    param([single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [single](2 * $R)
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-AppIcon {
    param([int]$S)

    $bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    $radius = [single]($S * 0.22)
    $rc = New-RoundedRectPath 0 0 $S $S $radius

    $navy = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)
    $accent = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($S, $S)),
        $navy, $accent)
    $g.FillPath($grad, $rc)

    $sheen = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sheen.AddEllipse([single](-0.05 * $S), [single](-0.25 * $S), [single](0.9 * $S), [single](0.9 * $S))
    $pb = New-Object System.Drawing.Drawing2D.PathGradientBrush($sheen)
    $pb.CenterColor = [System.Drawing.Color]::FromArgb(70, 255, 255, 255)
    $pb.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    $g.FillPath($pb, $rc)

    $penSpark = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(120, 255, 255, 255),
        [single]([Math]::Max(3, $S * 0.02)))
    $penSpark.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $penSpark.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.SetClip($rc)
    $sp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sp.AddPolygon(@(
        (New-Object System.Drawing.PointF([single](0.02 * $S), [single](0.60 * $S))),
        (New-Object System.Drawing.PointF([single](0.14 * $S), [single](0.40 * $S))),
        (New-Object System.Drawing.PointF([single](0.28 * $S), [single](0.52 * $S))),
        (New-Object System.Drawing.PointF([single](0.40 * $S), [single](0.26 * $S))),
        (New-Object System.Drawing.PointF([single](0.52 * $S), [single](0.44 * $S))),
        (New-Object System.Drawing.PointF([single](0.62 * $S), [single](0.18 * $S)))))
    $g.DrawPath($penSpark, $sp)

    $cx = [single](0.5 * $S)
    $cy = [single](0.545 * $S)
    $cr = [single](0.34 * $S)

    $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)),
        $cx - $cr, $cy - $cr, 2 * $cr, 2 * $cr)
    $ring = New-Object System.Drawing.Pen(
        [System.Drawing.Color]::FromArgb(35, 15, 23, 42),
        [single]([Math]::Max(2, $S * 0.012)))
    $ringInset = [single]($S * 0.008)
    $g.DrawEllipse($ring,
        $cx - $cr + $ringInset, $cy - $cr + $ringInset,
        2 * $cr - 2 * $ringInset, 2 * $cr - 2 * $ringInset)

    $inkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 29, 78, 216))
    $inkPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 29, 78, 216), [single]($S * 0.066))
    $inkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $inkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $stemW = [single]($S * 0.066)
    $stemLeft = $cx - $stemW / 2
    $stemTop = $cy - [single](0.20 * $S)
    $stemBot = $cy + [single](0.19 * $S)
    $g.FillRectangle($inkBrush, $stemLeft, $stemTop, $stemW, $stemBot - $stemTop)

    $bowlW = [single](0.22 * $S)
    $bowlRect = New-Object System.Drawing.RectangleF(
        [single]($cx + $stemW / 2), $stemTop, $bowlW, $bowlW)
    $g.DrawArc($inkPen, $bowlRect, -90, 180)

    $barH = [single]($S * 0.024)
    $barTop = $cy + [single](0.072 * $S)
    $barMid = $cy + [single](0.124 * $S)
    $barX1 = $cx - [single](0.07 * $S)
    $barX2 = $cx + [single](0.19 * $S)
    $g.FillRectangle($inkBrush, $barX1, $barTop, $barX2 - $barX1, $barH)
    $g.FillRectangle($inkBrush, $barX1, $barMid, $barX2 - $barX1, $barH)

    $g.ResetClip()
    $g.Dispose()
    return $bmp
}

$sizes = @(256, 128, 64, 48, 32, 24, 16)
$outDir = Join-Path $root 'generated'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$pngBlobs = [System.Collections.Generic.List[byte[]]]::new()
foreach ($s in $sizes) {
    $bmp = New-AppIcon $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBlobs.Add($ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
}

$master = New-AppIcon 256
$masterPath = Join-Path $root 'icon.png'
$master.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()

$icoPath = Join-Path $root 'icon.ico'
$fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([byte]0); $bw.Write([byte]0)
$bw.Write([byte]1); $bw.Write([byte]0)
$bw.Write([uint16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $dim = $s
    if ($dim -ge 256) { $dim = 0 }
    $bw.Write([byte]$dim)
    $bw.Write([byte]$dim)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$pngBlobs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $pngBlobs[$i].Length
}
foreach ($blob in $pngBlobs) { $bw.Write($blob) }
$bw.Flush()
$bw.Close()

Write-Output "wrote $icoPath ($((Get-Item $icoPath).Length) bytes, $($sizes.Count) sizes)"
Write-Output "wrote $masterPath"