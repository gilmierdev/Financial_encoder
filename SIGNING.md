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

`electron-builder` reads standard environment variables automatically and
`npm run release:signed` refuses to build a production installer when they are
missing:

```
SET CSC_LINK=C:\secure\financial-encoder.pfx
SET CSC_KEY_PASSWORD=your-secure-password
npm run release:signed
```

- `CSC_LINK` may also be an `https:` URL or a base64 `data:` URL (handy in CI).
- `npm run dist` / `npm run release` still produce **unsigned** installers for
  local testing. Only `release:signed` enforces signing.
- Never commit the certificate or the password to Git. Keep them in your CI
  secrets (GitHub Actions, GitLab CI, Jenkins, etc.).

## Sign unattended in GitHub Actions (recommended)

The release workflow (`.github/workflows/release.yml`) signs the installer
automatically when these two repository secrets are configured. If they are
missing, the workflow builds an unsigned installer exactly as before — signing
is a drop-in addition, not a requirement.

1. Base64-encode your `.pfx` file (PowerShell):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\secure\financial-encoder.pfx"))
   ```

2. In GitHub, open **Repository → Settings → Secrets and variables →
   Actions → New repository secret**, then add:

   | Secret name           | Value                                            |
   | --------------------- | ------------------------------------------------ |
   | `CSC_LINK_B64`        | the base64 string from step 1                    |
   | `CSC_KEY_PASSWORD`    | your certificate password                        |

3. Push a version tag (`v1.0.5`) as usual. The workflow decodes
   `CSC_LINK_B64` into a temporary `.pfx` on the runner, sets `CSC_LINK` /
   `CSC_KEY_PASSWORD` for the electron-builder step, and deletes the file
   afterwards.

The certificate never touches the repository — it only exists as environment
variables inside the runner and is masked in the logs.

### Verify in the workflow log

The final "Verify installer signature" step prints, for the published setup:

```
Signature status: Valid
Signer: CN=..., O=..., C=...
```

It does not fail the job if the build was unsigned (so unsigned fallback keeps
working), it only reports the status.

## Sign with Azure Trusted Signing

Provide these environment variables instead:

```
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_CERT_NAME=...
npm run release:signed
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

After a signed build, check the signature:

```powershell
npm run verify:windows-signature
```

This runs `scripts\verify-windows-signature.ps1`, which uses
`Get-AuthenticodeSignature` against the newest installer in `release\` and
prints the publisher, validity range and a PASS / FAIL conclusion. Point it at
a specific file with `-Path`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-windows-signature.ps1 -Path .\release\Financial-Encoder-Setup-1.0.8.exe
```

Status should be `Valid` and the publisher should match your certificate
(signing config targets **Gilmier Ej Cabil** / Financial Encoder © 2026).

> Note: the current installers in `release/` are **unsigned** (no certificate
> has been supplied), so the script will report `Status: NOT SIGNED`. That is
> expected until a real certificate is wired up.

## Troubleshooting

- **"The specified timestamp server could not be reached"** — the timestamp
  server can occasionally be blocked by a firewall; the build fails rather
  than producing an unsigned file. Re-run the build.
- **Certificate is not yet valid / expired** — verify certificate dates.
- **You do not see a signing prompt** — ensure `CSC_LINK` points to a readable
  `.pfx` and `CSC_KEY_PASSWORD` is set.