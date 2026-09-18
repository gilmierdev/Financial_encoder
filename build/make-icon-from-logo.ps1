# Regenerates build/icon.ico + build/icon.png from the master logo (build/logo.png)
# and refreshes the in-app favicon (public/icon.png).
#
# The master logo is not square (1205x1300). It is a glyph on a white tile that
# fills almost the whole canvas, so it is resized directly to a square rather
# than cropped.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File build/make-icon-from-logo.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root 'logo.png'

if (-not (Test-Path $source)) {
    Write-Error "logo.png not found at $source"
    exit 1
}

$src = [System.Drawing.Image]::FromFile($source)

function New-SquareResized {
    param([int]$Size)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $Size, $Size)
    $g.Dispose()
    return $bmp
}

$sizes = @(256, 128, 64, 48, 32, 24, 16)

$pngBlobs = [System.Collections.Generic.List[byte[]]]::new()
foreach ($s in $sizes) {
    $bmp = New-SquareResized $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBlobs.Add($ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
}

# Master 256px PNG (also used as the icon.png / favicon source)
$master = New-SquareResized 256
$masterPath = Join-Path $root 'icon.png'
$master.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
$master.Dispose()

# Icon.ico with PNG-compressed entries (same format the old generator produced)
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
$src.Dispose()

# Refresh the in-app favicon served from public/
$publicIcon = Join-Path $root '..\public\icon.png'
if (Test-Path (Split-Path $publicIcon)) {
    Copy-Item -LiteralPath $masterPath -Destination $publicIcon -Force
}

Write-Output "wrote $icoPath ($((Get-Item $icoPath).Length) bytes, $($sizes.Count) sizes)"
Write-Output "wrote $masterPath"
Write-Output "wrote $publicIcon"