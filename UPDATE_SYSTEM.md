# Financial Encoder — Automatic Update System

This document describes how Financial Encoder delivers new versions to users, how to build
and test an update, and how to publish a release, while keeping user data safe.

## How it works

Automatic updates use **electron-updater** backed by **GitHub Releases**. Every packaged build
embeds an `app-update.yml` that points at the release feed:

```yaml
owner: gilmierdev
repo: financial_encoder
provider: github
releaseType: release
updaterCacheDirName: financial_encoder-updater
```

> `releaseType: release` matters: electron-updater reads the GitHub **releases
> Atom feed**, which only contains **published** (finalized) releases. If a
> release is left as a *Draft*, the app reports
> «No published versions on GitHub» even though the tag exists.

Lifecycle:

1. **Startup check** — 15 s after the app starts (and on request from the renderer), the
   main process asks electron-updater for the latest version.
2. **Notify** — if a newer version exists, the renderer shows an **Update available** banner
   (new version, current version, sanitized release notes) with **Update Now / Later**.
3. **Download** — `Update Now` downloads the installer with a live progress bar. The download
   is verified against the **sha512** hash published in `latest.yml` before it can be used.
4. **Install** — `Restart & Update`:
   - a **safety backup** of `database.db` is written to `backups/` first;
   - the app quits, the NSIS installer silently replaces the application files;
   - the app relaunches on the new version. Database migrations (if any) run automatically.
5. **Up to date / error** — the banner confirms an up-to-date install or shows a helpful
   error with a retry.

## Versioning

- The **single source of truth** for the version is `package.json` → `version`. `app.getVersion()`
  and the NSIS artifact name derive from it. Never hardcode a version elsewhere.
- Release versions must be **incrementing**, e.g. `1.1.0` after `1.0.0`. electron-updater
  compares semantic versions; equal versions never trigger an update.
- Pre-release channels are **disabled** (`allowPrerelease: false`); only stable `x.y.z` builds
  are offered. Downgrades are not allowed (`allowDowngrade: false`).

## Build the installer (with update metadata)

```powershell
npm run dist
```

Output (see `release/`):

```
Financial-Encoder-Setup-<version>.exe
Financial-Encoder-Setup-<version>.exe.blockmap
latest.yml              <- update manifest: version, URL, size, sha512 (uploaded with the release)
win-unpacked/           <- portable unpacked build (for ad-hoc testing)
```

Notes:

- The build output lives in `release/` by default. **OneDrive is known to lock the build
  folder**, causing `EPERM` renames. If that happens, build outside OneDrive and copy back:

  ```powershell
  $env:FE_RELEASE_DIR = "C:\Users\<you>\AppData\Local\Temp\fe-release"
  npm run dist
  # then copy Financial-Encoder-Setup-*.exe, *.blockmap and latest.yml into release/
  ```

- **Do not modify the packaged `app-update.yml`**; it is generated from the `publish` block in
  `electron-builder.config.js`. Keep `oneClick: true` and
  `allowToChangeInstallationDirectory: false`: the installer path must be deterministic so
  electron-updater can replace the files.

## Publish an update (GitHub Releases)

The updater downloads from the latest **published** GitHub Release of
`gilmierdev/financial_encoder`. **Draft releases are never served** — they do
not appear in the releases feed, so the installed app sees
«No published versions on GitHub». Always publish (finalize) the release.

### One-command publish (recommended)

```powershell
$env:GH_TOKEN = "<token with repo scope>"
npm run release:publish
```

This builds the renderer + main process, packages the NSIS installer, generates
`latest.yml` + the `.blockmap`, creates the GitHub Release **as `release`
(final/published)**, and uploads the three artifacts. The release type is fixed
to `release` in `electron-builder.config.js`.

### Build only (no publishing)

```powershell
npm run release
```

Same build, no upload — everything stays in `release/`. You can then upload the
artifacts manually on github.com. `latest.yml` must sit in the release root next
to the installer.

### Version bump → release flow

1. Bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`).
2. Commit, then tag the commit and push:

   ```powershell
   git add package.json package-lock.json
   git commit -m "Release 1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

3. Either run the GitHub Actions **Release** workflow (tags `v*` auto-trigger
   it) or run `npm run release:publish` locally with `GH_TOKEN` set.
4. Confirm on github.com that the release shows **Published** (green, not
   «Draft») and contains `Financial-Encoder-Setup-1.0.1.exe`, its `.blockmap`
   and `latest.yml`.

Manual alternative: create the release on github.com and upload the three
artifacts above, then click **Publish release**.

> **Important:** never upload a `latest.yml` that does not match the installer
> in the same release, and always finalize releases. A draft or mismatched
> release causes failed checks or «No published versions on GitHub».

### Deliverability example

| Step | Action |
| --- | --- |
| 1 | Publish `v1.0.0` (build + upload + **Publish release** on GitHub). |
| 2 | Users install `Financial-Encoder-Setup-1.0.0.exe`. |
| 3 | You bump to `1.0.1`, build, publish `v1.0.1`. |
| 4 | Installed `1.0.0` app checks → sees `1.0.1` in `latest.yml` → banner. |
| 5 | User downloads, restarts, app becomes 1.0.1. Database untouched. |

## Integrity and security

| Property | Guarantee |
| --- | --- |
| Transport | Updates are fetched over **HTTPS only** (GitHub Releases). |
| Integrity | Every downloaded installer is verified against the **sha512** in `latest.yml` before it can run. |
| Feed pinning | The feed is baked into the app at build time; the renderer cannot change it. |
| Env override | `FINANCIAL_ENCODER_UPDATE_FEED` is honoured only for testing and only for `https:` or `http://localhost` / `127.0.0.1`; other URLs are rejected. |
| Dev safety | The updater is inert while `app.isPackaged === false` — dev runs never self-update. |
| Downgrades | Disabled. |
| Human gate | Nothing downloads or installs without the user clicking the banner action. |

## User-data safety

- The update only interacts with the **install directory** (`%LOCALAPPDATA%\Programs\...`).
- The user-data folder (`C:\Users\<USER>\AppData\Roaming\FinancialEncoder\` — database,
  backups, settings) is **never** touched or deleted by the updater.
- Immediately before the app restarts to apply an update, `createBackup()` snapshots
  `database.db` into `backups/` (visible in Settings → Backups).
- If the new version ships schema changes, they are applied by the existing migration runner
  on next launch; the pre-update backup remains available if a revert is ever needed.

## Rollback / recovery

- **Application:** re-run the previous version's installer
  (`release/archive-pre-updater/` holds the original `1.0.0` installer). NSIS installs
  side-by-side per-user; the downgrade replaces the executable while user data stays put.
- **Data:** restore the latest backup from Settings → Backups, or a portable `.febak` file
  (Settings → Backup → Restore). See `RELEASE_NOTES.md` for the `.febak` format.

## Testing

### Local feed (no GitHub account needed)

1. Build the installer.
2. Serve `release/` over `https://` **or** `http://127.0.0.1`, e.g.:

   ```powershell
   # Option A: python -m http.server 8080 --bind 127.0.0.1 -d release
   ```

3. On a second machine (or a second version of the app), launch with:

   ```powershell
   $env:FINANCIAL_ENCODER_UPDATE_FEED = "http://127.0.0.1:8080"
   & "release\win-unpacked\Financial Encoder.exe"
   ```

   Keep `latest.yml` pointing at the newer version to observe the full flow.

### Manual test matrix

| # | Scenario | Expected result |
| --- | --- | --- |
| 1 | App at newest version, online | Banner briefly shows “You're up to date”, then disappears. |
| 2 | App older than feed | “Update available: vX (you have vY)” with sanitized release notes. |
| 3 | “Later” on available | Banner hides; no download. No nag until a re-check. |
| 4 | “Update Now” | Progress bar with %, transferred/total MB. |
| 5 | Cancel mid-download (close app) | Resumes/restarts download next time; never applies partial file. |
| 6 | Download completes | “Update ready — restart to install”. “Restart & Update” present. |
| 7 | “Restart & Update” | Safety backup appears in Settings → Backups; app quits, installer runs, relaunches on new version. |
| 8 | Offline / blocked feed | Error banner with friendly message + “Try again”. No crash. |
| 9 | Corrupt/evil feed | sha512 mismatch → clear failure, old version stays, no data touched. |
| 10 | `FINANCIAL_ENCODER_UPDATE_FEED=http://example.com` | Feed rejected (banner never appears); bad env ignored. |
| 11 | Development (`npm run dev`) | No update code runs at all. |
| 12 | Same version offered | Not shown (“You're up to date”). |
| 13 | Release notes contain HTML | Rendered as plain text; tags stripped; length capped. |
| 14 | Update with schema migration | Migrations run on next launch; data intact; backup available. |
| 15 | Uninstall after updating | Uninstaller removes the app but keeps `AppData\Roaming\FinancialEncoder`. |

## Troubleshooting

- **«No published versions on GitHub»** — the root cause is that **no published
  (finalized) GitHub Release exists** for `gilmierdev/financial_encoder`
  (drafts are invisible to electron-updater). Publish `v1.0.0` (or newer), then
  re-check. The app previously built the installer but never published it.
- **Banner never appears / not-available every time** — confirm the release is **finalized** on
  GitHub and that `latest.yml` inside it has a newer `version` than the installed app.
- **Download fails partway** — retry from the banner; electron-updater resumes from its cache.
- **sha512 mismatch** — `latest.yml` and the installer were from different builds. Rebuild and
  re-upload both together.
- **EPERM during `npm run dist`** — OneDrive lock; build with `FE_RELEASE_DIR` outside OneDrive
  (see above).
- **`spawn UNKNOWN` during `npm run release` (NSIS step)** — Smart App Control (or another
  Application Control policy) blocks the freshly-built, unsigned NSIS stub from executing to
  extract the uninstaller. **Do not disable SAC.** Either sign the build with a legitimate
  certificate (see `SIGNING.md`) or run the build where the policy does not apply — e.g. the
  included GitHub Actions **Release** workflow, which builds on a fresh Windows runner with no
  such policy.
- **Duplicate GitHub releases with the same tag after a CI publish** — electron-builder's
  publisher can race and create two releases with one tag (both look correct, but one ends up
  missing the installer/`latest.yml`). The **Release** workflow already guards against this:
  it deletes stale same-tag releases, pre-creates exactly one target release, and let
  electron-builder only upload into it.
- **Updater logs** — everything is written to `logs/` in the user-data folder and mirrored to the
  console in dev.