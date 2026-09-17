# Provisions the local PaddleOCR runtime for Financial Encoder.
#
# Creates ocr-runtime/ (standalone CPython 3.12 + PaddlePaddle + PaddleOCR) and
# downloads the model files into ocr-sidecar/models so packaged builds work
# fully offline. Both folders are git-ignored build artifacts.
#
# Requires uv: https://docs.astral.sh/uv/
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'ocr-runtime'
$models = Join-Path $root 'ocr-sidecar\models'

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw 'uv is required. Install it from https://docs.astral.sh/uv/ and re-run.'
}

Write-Host 'Locating standalone CPython 3.12...'
uv python install 3.12 | Out-Host
$base = (& uv python find 3.12).Trim()
if (-not (Test-Path -LiteralPath $base)) { throw "Could not locate CPython 3.12 at $base" }
$baseDir = Split-Path -Parent $base

if (-not (Test-Path -LiteralPath (Join-Path $runtime 'python.exe'))) {
    Write-Host 'Copying standalone runtime to ocr-runtime...'
    if (Test-Path -LiteralPath $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }
    Copy-Item -LiteralPath $baseDir -Destination $runtime -Recurse -Force
}

$marker = Join-Path $runtime 'Lib\EXTERNALLY-MANAGED'
if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }

Write-Host 'Installing PaddlePaddle, PaddleOCR and PyMuPDF...'
uv pip install --python (Join-Path $runtime 'python.exe') 'paddlepaddle==3.3.1' 'paddleocr==3.7.0' 'pymupdf'

New-Item -ItemType Directory -Force -Path $models | Out-Null
Write-Host 'Downloading OCR models into ocr-sidecar/models (first run only)...'
$env:FLAGS_use_mkldnn = '0'
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = 'True'
$env:PADDLE_PDX_CACHE_HOME = $models
& (Join-Path $runtime 'python.exe') -c "from paddleocr import PaddleOCR; PaddleOCR(use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, lang='en', enable_mkldnn=False)"
if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }

Write-Host 'PaddleOCR runtime is ready.'
