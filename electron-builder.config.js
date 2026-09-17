// electron-builder configuration for Financial Encoder (Windows x64 NSIS).
//
// Release output:
//   Default: <project>/release/
//   Override: FE_RELEASE_DIR=<path> npm run dist
//
// Publisher identity (shown to Windows users in the installer/app details):
//   Company name : Gilmier Ej Cabil
//   Product name : Financial Encoder
//   Copyright    : Copyright © 2026 Gilmier Ej Cabil
//
// Code signing (optional but strongly recommended for distribution):
//   electron-builder reads the standard environment variables below; no
//   certificate is ever committed to the repository.
//     CSC_LINK          - path or https: URL of the .pfx/.p12 signing cert
//     CSC_KEY_PASSWORD  - password for that certificate
//   For CI you can also provide the cert via CSC_LINK as a base64 data URL.
//   When these are unset the build produces a normal unsigned installer.
//
//   To add an Azure Trusted Signing endpoint instead, provide:
//     AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_CERT_NAME
//
//   Production releases must be signed: use `npm run release:signed`, which
//   fails fast when CSC_LINK / CSC_KEY_PASSWORD are missing. See SIGNING.md.
//
const path = require('path')

const outputDir = process.env.FE_RELEASE_DIR || path.join(__dirname, 'release')

module.exports = {
  appId: 'com.financialencoder.app',
  productName: 'Financial Encoder',
  copyright: 'Copyright © 2026 Gilmier Ej Cabil',
  directories: {
    output: outputDir,
    buildResources: 'build',
  },
  files: ['dist-electron/**/*', 'dist-renderer/**/*', 'package.json'],
  asar: true,
  asarUnpack: [
    '**/*.node',
    'node_modules/better-sqlite3/**/*',
    'node_modules/@napi-rs/**/*',
  ],
  extraResources: [
    { from: 'resources/ocr', to: 'ocr' },
    // PaddleOCR sidecar script + offline models, and the standalone Python runtime.
    { from: 'ocr-sidecar', to: 'ocr-paddle', filter: ['**/*', '!**/__pycache__/**'] },
    { from: 'ocr-runtime', to: 'ocr-paddle/python' },
  ],
  compression: 'maximum',
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    artifactName: 'Financial-Encoder-Setup-${version}.${ext}',
    icon: 'build/icon.ico',
    // Produces a clean executable/installer that can later be signed with a
    // legitimate certificate (see CSC_LINK above). Defaults to true.
    signAndEditExecutable: true,
    // Windows publisher metadata (CompanyName in the file version info).
    legalTrademarks: 'Financial Encoder',
    signtoolOptions: {
      // The publisher name must match the certificate subject exactly when
      // signing. Used by the update signature verification once signed.
      publisherName: 'Gilmier Ej Cabil',
    },
  },
  publish: [
    {
      provider: 'github',
      owner: 'gilmierdev',
      repo: 'financial_encoder',
      releaseType: 'release',
    },
  ],
  releaseInfo: {
    releaseNotesFile: 'RELEASE_NOTES.md',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Financial Encoder',
    uninstallDisplayName: 'Financial Encoder ${version}',
    deleteAppDataOnUninstall: false,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
  },

}