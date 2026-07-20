<h1 align="center">Snow Devil</h1>

<p align="center">
  <img src="assets/readme-icon.svg" width="120" height="120" alt="Snow Devil icon">
</p>

<p align="center">
  <strong>A desktop GitHub workbench for current work, history, CI, diffs, and repository investigation.</strong>
</p>

<p align="center">
  <a href="https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/danyalahmed1995/Snow-Devil/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/release.yml"><img alt="Release" src="https://img.shields.io/github/actions/workflow/status/danyalahmed1995/Snow-Devil/release.yml?style=flat-square&label=Release"></a>
  <a href="https://github.com/danyalahmed1995/Snow-Devil/releases"><img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-3878ff?style=flat-square"></a>
  <a href="LICENSE"><img alt="GPL-3.0 license" src="https://img.shields.io/github/license/danyalahmed1995/Snow-Devil?style=flat-square"></a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-0078D4?style=flat-square&logo=windows&logoColor=white">
</p>

![Snow Devil home](assets/snow-devil-demo/Home%202.gif)

Snow Devil brings GitHub account and repository data into one local desktop app. It is built for checking what needs attention, following work through review and CI, browsing repository history, and opening the evidence behind a signal without moving through several GitHub pages.

GitHub access is read-only. When GitHub does not provide enough data, Snow Devil shows the result as partial, stale, inferred, unsupported, or unavailable instead of filling in the gaps.

## Main features

- **Home** — current work, completed work, attention items, recent repositories, recent merges, and quick links.
- **Flow** — issues, coding work, pull requests, review, checks, ready, merged, released, and deployed stages with filters and saved views.
- **CI Activity, Delivery Risks, and Flow Analytics** — failed checks, aging branches, blocked work, review waits, throughput, lead time, and delivery status.
- **Account History and Repository History** — choose a date and inspect what was active, completed, or known at that point.
- **Repository Explorer** — browse branches and files, preview text, Markdown, and common image formats, and search inside files.
- **Pull request diff viewer** — changed-file navigation, unified and split views, additions and deletions, filters, and GitHub fallback.
- **Commit graph** — branch topology, commit details, changed files, patch previews, CI state, commit comparison, and links into Flow, History, CI, Architecture, and the repository explorer.
- **Architecture context** — inspect repository components, dependencies, ownership, impact, and supporting evidence.
- **Sketch Board** — paste screenshots from the clipboard, move and resize them, draw, add text, erase items, undo and redo, and keep the board locally.
- **Personal Focus and notifications** — review requests, failed checks, work in progress, aging work, and a native unread inbox.
- **Command palette** — open app pages, repositories, files, issues, pull requests, and cached items from one search box.
- **Region capture** — hold the right mouse button, drag over part of the app, and copy that area to the clipboard for the Sketch Board or another tool.
- **Native tabs and GitHub tabs** — keep multiple work items open, restore tabs after restart, and reuse an existing tab instead of opening duplicates.
- **Demo Mode** — run the main app against deterministic local fixtures without connecting a GitHub account.

## App tour

<table>
  <tr>
    <td width="50%"><strong>Onboarding</strong><br><img src="assets/snow-devil-demo/Onboarding%201.gif" alt="Snow Devil onboarding"></td>
    <td width="50%"><strong>Home</strong><br><img src="assets/snow-devil-demo/Home%202.gif" alt="Snow Devil home screen"></td>
  </tr>
  <tr>
    <td width="50%"><strong>Flow</strong><br><img src="assets/snow-devil-demo/Flow%203.gif" alt="Snow Devil flow board"></td>
    <td width="50%"><strong>CI Activity</strong><br><img src="assets/snow-devil-demo/Ci%20activity%204.gif" alt="Snow Devil CI activity"></td>
  </tr>
  <tr>
    <td width="50%"><strong>Pull request diff</strong><br><img src="assets/snow-devil-demo/PR%20diff%205.gif" alt="Snow Devil pull request diff"></td>
    <td width="50%"><strong>Architecture context</strong><br><img src="assets/snow-devil-demo/Architecture%20context%206.gif" alt="Snow Devil architecture context"></td>
  </tr>
  <tr>
    <td width="50%"><strong>Repository explorer</strong><br><img src="assets/snow-devil-demo/Repo%20View%207.gif" alt="Snow Devil repository explorer"></td>
    <td width="50%"><strong>Commit graph and diff</strong><br><img src="assets/snow-devil-demo/commit%20graph%20and%20diff%208.gif" alt="Snow Devil commit graph and diff"></td>
  </tr>
</table>diff"></td>
  </tr>
</table>

## Stack

| Part | Used here |
| --- | --- |
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| Client state | Zustand |
| Server state | TanStack Query |
| Native code | Rust |
| GitHub data | OAuth device flow, GraphQL, REST |
| Local data | SQLite, IndexedDB, local preferences |
| Credentials | Operating-system credential store |
| Tests | Vitest, Testing Library, Playwright, Rust tests |

## Run locally

### Requirements

- Node.js 24
- pnpm 11
- Rust toolchain
- Tauri 2 prerequisites for your operating system
- WebView2 and Microsoft C++ Build Tools on Windows
- Optional GitHub OAuth App client ID with Device Flow enabled

### Install and run

```powershell
pnpm install
pnpm tauri dev
```

Use Demo Mode to run without a GitHub account.

For browser-only frontend work:

```powershell
pnpm dev
```

The browser build cannot use Tauri commands, SQLite, the credential store, native window behavior, or embedded GitHub webviews.

## Development commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the Vite frontend |
| `pnpm tauri dev` | Start the desktop app |
| `pnpm build` | Type-check and build the frontend |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run frontend tests |
| `pnpm test:watch` | Run frontend tests in watch mode |
| `pnpm test:e2e` | Run Playwright tests |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Run Rust tests |

CI runs frontend checks, Rust checks, Playwright tests, and a Windows Tauri build on pushes and pull requests to `main`.

## GitHub access and local data

- GitHub integration is read-only. Snow Devil does not merge pull requests, submit reviews, edit issues, rerun workflows, or publish releases.
- OAuth tokens are stored in the operating-system credential store.
- Normalized GitHub data is cached locally in SQLite.
- Sketch Board content is stored locally in IndexedDB.
- Demo Mode uses source-controlled fixtures and does not write demo records into the live account cache.

## Current limits

- Windows is the primary supported desktop platform.
- Available history depends on GitHub permissions, pagination, retention, and API coverage.
- The native diff viewer does not replace GitHub's full review UI.
- Repository tree filtering is not full GitHub code search.
- Release builds are currently unsigned.
- Team workspaces, cloud sync, role-based access, and multi-account support are not implemented.

## Releases

Releases are triggered by pushing a version tag such as `v0.2.0` to the repository. The available installers are:

- **Windows x64**: The `.exe` setup is the normal interactive installer, and the `.msi` package is available for managed or manual installation.
- **Linux x64**: The `.AppImage` package is the portable option, and the `.deb` package is for Debian-based distributions.
- **macOS**: Separate Apple Silicon `.dmg` (for M-series Macs) and Intel `.dmg` (for Intel Macs) downloads are provided.

All release builds are currently unsigned. Please verify your downloads using the SHA-256 checksums file attached to each release.

## License

Snow Devil is released under the [GNU General Public License v3.0](LICENSE).
