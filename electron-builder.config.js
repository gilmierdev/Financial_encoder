// electron-builder configuration for Financial Encoder (Windows x64 NSIS).
//
// Release output:
//   Default: <project>/release/
//   Override: FE_RELEASE_DIR=<path> npm run dist
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
//   See SIGNING.md for the full guide.
//
// Release publishing / auto-update:
//   Updates are delivered from GitHub Releases over HTTPS (electron-updater).
//   Publishing to GitHub requires a token:
//     GH_TOKEN=<token with "repo" scope> npm run dist -- --publish always
//   A "draft" release is created by default; finalize it on GitHub (or pass
//   releaseType: 'release' below) before users are notified.
const path = require('path')

const outputDir = process.env.FE_RELEASE_DIR || path.join(__dirname, 'release')

module.exports = {
  appId: 'com.financialencoder.app',
  productName: 'Financial Encoder',
  copyright: 'Copyright © 2026 Financial Encoder',
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
  extraResources: [{ from: 'resources/ocr', to: 'ocr' }],
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
  },
  // Auto-update requires a deterministic per-user install directory, so the
  // installer uses the standard one-click NSIS mode (no custom folder choice,
  // no admin rights). The app-update.yml + latest.yml files that
  // electron-updater consumes are generated automatically from this publish
  // block when a release build is made.
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
  publish: [
    {
      provider: 'github',
      owner: 'gilmierdev',
      repo: 'financial-encoder',
      releaseType: 'draft',
      // HTTPS is always used; electron-builder refuses "http" for GitHub.
    },
  ],
}