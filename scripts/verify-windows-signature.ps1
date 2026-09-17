<#
.SYNOPSIS
    Verifies the Authenticode signature of a Financial Encoder Windows installer
    (or any executable) and prints a short PHO-friendly summary.
.DESCRIPTION
    Uses Get-AuthenticodeSignature to inspect the signature of the given file.
    Reports the signer / publisher / certificate subject, signature validity,
    and a PASS / FAIL / NOT SIGNED conclusion. Returns exit code 0 on a valid
    signature, 1 otherwise.
.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-windows-signature.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-windows-signature.ps1 -Path .\release\Financial-Encoder-Setup-1.0.8.exe
#>
[CmdletBinding()]
param(
    [string]$Path
)

$ErrorActionPreference = 'Stop'

# Resolve the most recent installer when no path is supplied.
if (-not $Path) {
    $releaseDir = Join-Path $PSScriptRoot '..\release'
    $candidates = @(Get-ChildItem -LiteralPath $releaseDir -Filter 'Financial-Encoder-Setup-*.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
    if ($candidates.Count -eq 0) {
        Write-Error "No Financial-Encoder-Setup-*.exe found in $releaseDir. Pass -Path to a specific file."
    }
    $Path = $candidates[0].FullName
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-Error "File not found: $Path"
}

Write-Host ''
Write-Host "= Windows Code Signature Verification =$([Environment]::NewLine)"

$name = Split-Path -Leaf $Path
Write-Host ('Application:')
Write-Host ('  ' + $name)
Write-Host ''

$sig = Get-AuthenticodeSignature -LiteralPath $Path

Write-Host ('Publisher:')
if ($sig.SignerCertificate) {
    Write-Host ('  ' + ($sig.SignerCertificate.Subject -replace '^CN=', ''))
} else {
    Write-Host '  (none)'
}
Write-Host ''

Write-Host ('Signature:')
Write-Host ('  ' + $sig.Status.ToString())
Write-Host ''

Write-Host ('Certificate:')
if ($sig.SignerCertificate) {
    $cert = $sig.SignerCertificate
    $thumbprint = if ($cert.Thumbprint) { $cert.Thumbprint } else { '(unknown)' }
    $validFrom = if ($cert.NotBefore) { $cert.NotBefore.ToString('yyyy-MM-dd') } else { '(unknown)' }
    $validTo   = if ($cert.NotAfter)  { $cert.NotAfter.ToString('yyyy-MM-dd') }   else { '(unknown)' }
    Write-Host ('  Subject  : ' + $cert.Subject)
    Write-Host ('  Issuer   : ' + $cert.Issuer)
    Write-Host ('  Valid    : ' + $validFrom + ' to ' + $validTo)
    Write-Host ('  SHA1     : ' + $thumbprint)
} else {
    Write-Host '  (no certificate present)'
}
Write-Host ''

$status = $sig.Status

if ($status -eq [System.Management.Automation.SignatureStatus]::Valid) {
    Write-Host 'Status:' -NoNewline
    Write-Host '  PASS' -ForegroundColor Green
    Write-Host 'The file is Authenticode-signed with a valid, unexpired certificate.'
    Write-Host ''
    exit 0
}
elseif ($status -eq [System.Management.Automation.SignatureStatus]::NotSigned) {
    Write-Host 'Status: NOT SIGNED' -ForegroundColor Yellow
    Write-Host 'The file carries no Authenticode signature. It was built without a'
    Write-Host 'certificate (CSC_LINK / CSC_KEY_PASSWORD not set) or was not digitally signed.'
    Write-Host ''
    exit 1
}
else {
    Write-Host 'Status: FAIL' -ForegroundColor Red
    Write-Host ('Signature status is "' + $status.ToString() + '".')
    if ($status -eq [System.Management.Automation.SignatureStatus]::HashMismatch) {
        Write-Host 'The file was modified after signing.'
    }
    elseif ($status -eq [System.Management.Automation.SignatureStatus]::NotTrusted) {
        Write-Host 'The certificate chain is not trusted on this machine (self-signed or untrusted root).'
    }
    Write-Host ''
    exit 2
}