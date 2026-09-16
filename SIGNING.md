# Code Signing for Financial Encoder (Windows)

Windows may warn about any **unsigned** application (Smart App Control,
SmartScreen, Defender). The correct way to reduce those warnings is to sign
Financial Encoder with a **legitimate code-signing certificate**. Never
disable Windows security features, and never use cracked/fake certificates.

The project is already prepared for signing. **No certificate is stored in
this repository** — you supply it through secure environment variables or CI
secrets.

## What you need

A Windows code-signing certificate. Common options:

1. **Individual / organisation certificate** — a `.pfx`/`.p12` file from a
   certificate authority (for example DigiCert, Sectigo, GlobalSign), valid
   for extended validation (EV) or standard signing.
2. **Azure Trusted Signing** — Microsoft's managed signing service (no `.pfx`
   file; signing happens in the cloud).

## Sign with a .pfx certificate

`electron-builder` reads standard environment variables automatically:

```
SET CSC_LINK=C:\secure\financial-encoder.pfx
SET CSC_KEY_PASSWORD=your-secure-password
npm run dist
```

- `CSC_LINK` may also be an `https:` URL or a base64 `data:` URL (handy in CI).
- Never commit the certificate or the password to Git. Keep them in your CI
  secrets (GitHub Actions, GitLab CI, Jenkins, etc.).

## Sign with Azure Trusted Signing

Provide these environment variables instead:

```
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_CERT_NAME=...
npm run dist
```

## What signing does not guarantee

Signing a binary does **not** guarantee zero warnings on every machine.
Windows also considers publisher identity, certificate validity, application
reputation, download source (browser download vs direct/USB), Smart App
Control and SmartScreen reputation.

Recommended distribution path:

1. Sign with a legitimate certificate.
2. Distribute through a trusted channel (your own site with HTTPS, or a store).
3. Build reputation over time (more downloads, better trust).

## Verifying the output

After a signed build, check the signature (PowerShell):

```powershell
Get-AuthenticodeSignature "release\Financial-Encoder-Setup-1.0.0.exe"
```

Status should be `Valid`.

## Troubleshooting

- **"The specified timestamp server could not be reached"** — the timestamp
  server can occasionally be blocked by a firewall; the build fails rather
  than producing an unsigned file. Re-run the build.
- **Certificate is not yet valid / expired** — verify certificate dates.
- **You do not see a signing prompt** — ensure `CSC_LINK` points to a readable
  `.pfx` and `CSC_KEY_PASSWORD` is set.