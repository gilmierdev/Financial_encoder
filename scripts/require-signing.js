// Fails fast when a production release is requested without code-signing
// credentials. Run via `npm run release:signed` (or `release:publish`).
//
// A production installer should never be published unsigned. This guard makes
// sure CSC_LINK (path/URL/base64 of the .pfx certificate) and
// CSC_KEY_PASSWORD are present before electron-builder runs. It does NOT read
// or log the secret values, only their presence.
'use strict'

const requiredVars = ['CSC_LINK', 'CSC_KEY_PASSWORD']

const missing = requiredVars.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error('\n[require-signing] Refusing to build a production release without signing credentials.')
  console.error(`[require-signing] Missing environment variable(s): ${missing.join(', ')}`)
  console.error('[require-signing]')
  console.error('[require-signing] Supply a legitimate Windows code-signing certificate before packaging:')
  console.error('[require-signing]   CSC_LINK         - path, https: URL, or base64 data: URL of the .pfx/.p12 cert')
  console.error('[require-signing]   CSC_KEY_PASSWORD - password for that certificate')
  console.error('[require-signing]')
  console.error('[require-signing] Alternatively configure Azure Trusted Signing (AZURE_TENANT_ID,')
  console.error('[require-signing] AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_CERT_NAME).')
  console.error('[require-signing] See SIGNING.md for the complete guide.')
  console.error('[require-signing] For an UNSIGNED local test build, use `npm run dist` / `npm run release` instead.')
  process.exit(1)
}

console.log('[require-signing] Signing credentials detected. Proceeding with signed production build.')