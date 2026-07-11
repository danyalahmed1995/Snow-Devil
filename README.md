# Snow Devil

[![CI](https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/ci.yml)
[![Release](https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/release.yml/badge.svg)](https://github.com/danyalahmed1995/Snow-Devil/actions/workflows/release.yml)
[![Version](https://img.shields.io/badge/version-0.1.0-3878ff)](https://github.com/danyalahmed1995/Snow-Devil/releases)
[![License: GPL v3](https://img.shields.io/badge/license-GPL%20v3-blue.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078d4)](#product-status)

Snow Devil is a Windows desktop app for keeping track of work in GitHub. It brings your current work, account and repository history, delivery analytics, source browsing, pull-request diffs, notifications, and related evidence into one Tauri workspace.

GitHub data is not always complete. Snow Devil marks results as partial, inferred, stale, unsupported, or unavailable when that is the honest answer.

## Product status

- Version: `0.1.0`
- Primary platform: Windows desktop through Tauri 2 and WebView2
- GitHub behavior: read-only integration
- Modes: authenticated GitHub account and deterministic offline Demo Mode
- Persistence: local SQLite, operating-system credential storage, and selected local preferences
- Current verification baseline: 450 frontend tests, 49 Playwright tests passing, and 69 Rust tests passing

## What Snow Devil helps answer

- What needs my attention right now?
- Which issues, pull requests, reviews, checks, branches, or repositories are blocked or aging?
- What was active or completed on a particular date?
- How did work progress through review, checks, merge, release, and deployment?
- How healthy is delivery flow across my maintained repositories?
- What source file, patch, or evidence record explains a signal?
- Which facts are exact, partial, inferred, stale, or unavailable?

## Implemented features

### Desktop workspace

- Persistent native and embedded-GitHub tabs with restored-state migration and sanitization.
- Home, Flow, CI Activity, Delivery Risks, Flow Analytics, Personal Focus, Account History, Repository History, Settings, Notifications, Evidence Graph, Repository Explorer, and Pull Request Diff surfaces.
- Tab context menus, refresh behavior, keyboard navigation, middle-click close, pinned tabs, and safe fallback to Home.
- Shell-level render recovery so malformed restored state produces a recovery screen instead of a blank window.
- One canonical Snow Devil dark visual system with responsive desktop layouts, reduced-motion support, visible focus states, and semantic status colors.

### Home and current Flow

- Home command center with attention totals, active/completed work, pipeline preview, recent repositories, recent merges, synchronization context, and deep links.
- Account and repository Flow scopes with lifecycle stages for issues, coding, pull requests, review, checks, ready, merged, released, and deployed work.
- Repository, range, stage, view, involvement, actor, activity, and structured-search filters.
- Viewer-relationship labels such as authored, assigned, review requested, and submitted upstream.
- Organization-aware repository discovery and base-repository handling for incoming fork pull requests.
- Saved local views for reusable Flow and analytics filters.
- Event Stream and supporting totals with inspectable evidence.

### Opening work items

- Pull requests open in Snow Devil's native pull-request viewer.
- CI runs open in the native CI run viewer.
- Issues open in Snow Devil's built-in browser; there is no native issue viewer yet.
- `Open in Flow` carries the selected item into the right Flow stage and is hidden when you are already in Flow.
- Repeated clicks focus an existing destination tab instead of opening another copy.
- The Inspector uses clear labels such as `Open PR`, `Open CI Run`, `Open in App Browser`, `Open on GitHub`, and `Copy Link`.

#### Focused-stage scrolling

Home deep links into a single Flow stage now use a bounded, dedicated vertical scroll owner rather than the multi-stage horizontal board model.

- Mouse wheel, trackpad, Page Up, Page Down, Home, End, and focus scrolling work.
- All loaded cards and the final row remain reachable.
- The responsive grid expands from one to four columns as space permits.
- Show more and Load more append without jumping to the top.
- Inspector resize and tab switching preserve normalized scroll position and expansion state.
- The Event Stream/footer reserves its own space and does not cover cards.
- Multi-stage Flow retains its horizontal lane behavior.

### Account History and Repository History

The former simulators are now date-first cumulative history explorers:

> Choose a date and see what existed, what was active, what was completed, and how far the account or repository had progressed.

- Strict selected-date cutoff with no future-state leakage.
- Canonical entity identity and deterministic event ordering.
- Semantic duplicate suppression before reconstruction and counting.
- Baseline support for work that existed before the loaded range, labeled **Existing at history start**.
- Authoritative current-state assertions only at Today/latest; they never rewrite an older date.
- Separate **Active on selected date**, **Completed by selected date**, and compact activity sections.
- Date picker, previous/next meaningful date, Today, optional animation, filters, search, and incremental pagination.
- Responsive playback controls never overlap; hiding them pauses playback without resetting the selected date.
- One business-timezone cutoff drives the picker, slider, tooltip, Today state, activity, metrics, and inspector evidence.
- Cumulative metrics for PRs, issues, reviews, repositories, contributors, releases, deployments, and recorded evidence.
- Repository History includes loaded work targeting the selected base repository regardless of author or fork origin.
- Truthful aggregate source states such as `History ready · Partial data · N of M sources loaded`.
- Source Details includes purpose, affected data, status, reason, and retryability when supplied by the provider.
- Source Details is a keyboard-accessible, tab-scoped disclosure with a close action and bounded internal scrolling.
- Source completeness and historical depth are reported separately, and refresh retains the previous snapshot.
- Persisted tabs using the old Simulator names reopen under the new History labels without changing internal route IDs.
- Fixed native pages use singleton identities and restore mounted state instead of refetching merely because the tab was activated.

### Analytics and evidence

- CI Health with branch age, integration activity, health grades, percentiles, and inspectable lineage.
- Delivery Risks with evidence-backed blocked, review, stale, ready-to-merge, and delivery-status triage across repositories.
- Flow Analytics with cumulative flow, throughput, lead-time distributions, review wait, check timing, percentiles, outlier handling, and source coverage.
- Personal Focus with reviews requested, authored work, failed checks, WIP, aging/dormant work, and local dismiss/snooze/exclusion preferences.
- Metric lineage in the Inspector, including formula, sample count, time basis, included repositories, exclusions, and confidence.
- Evidence Graph for bounded native traversal of related work and evidence.

#### Responsive Cumulative Flow chart

- The plot measures its actual container with `ResizeObserver`.
- SVG width, viewBox, x-scale, hit areas, grid, crosshair, and tooltip bounds update together.
- It responds to live window resizing, inspector open/close, font readiness, and parent layout changes.
- The plotting region uses the full panel width with no fixed desktop maximum.
- Height remains stable while width changes.
- Legend, axes, selected date, keyboard interaction, and reduced-motion behavior are preserved.

### Repository investigation

- Lazy hierarchical repository tree with branch selection, file/folder icons, loaded-entry filtering, keyboard navigation, breadcrumbs, and persistent expansion state.
- A dedicated tree scroll region so expanded folders do not hide lower files.
- Stale-request protection when changing repositories, branches, folders, or files quickly.
- Breadcrumb state based on the selected path rather than stale content data, preventing the previous repository-specific render failure.
- Text preview with line numbers and in-file search.
- Rendered GitHub-flavored Markdown.
- Safe PNG, JPEG, SVG, and WebP preview with dimensions, Fit, Actual Size, zoom, reset, sanitization, and object-URL cleanup.
- Large-file guards: normal text rendering stops above 1 MB and in-app image decoding stops above 5 MB.
- Native pull-request diff with changed-file navigation, additions/deletions, unified/split layouts, filters, and canonical GitHub fallback.
- Repository search and virtualized tree support for larger source sets.

### GitHub and account integration

- GitHub OAuth device flow configured from the sign-in dialog.
- GraphQL and REST adapters for account, repository, workflow, simulator, analytics, notification, and source evidence.
- Token storage in the operating-system credential store.
- Local normalized cache with refresh, stale, partial, failed-source, reset, and recovery states.
- Managed embedded GitHub webviews with restricted navigation and native tab identity.
- Native read-only notification inbox with unread state, search, reason filters, local snooze, native PR routing, and GitHub links.
- Global command palette for commands, repositories, files, issues, pull requests, and cached entities.
- Privacy-safe diagnostic export containing runtime metadata and anonymous record counts—never tokens, cookies, repository names, API payloads, or file contents.
- Explicit restrictive Content Security Policy in the Tauri configuration.

### Demo Mode

- Runs from deterministic source-controlled fixtures without requiring a GitHub account.
- Does not silently fall back to live GitHub traffic.
- Uses the same production data types and primary interfaces.
- Supports reset and exit without writing demo records into live account caches.

## Historical correctness model

For a selected date, Snow Devil:

1. excludes evidence after the cutoff;
2. sorts eligible evidence deterministically;
3. deduplicates semantically equivalent records;
4. applies a baseline when an entity predates the loaded range;
5. reconstructs the strongest supported state;
6. separates active and completed canonical entities; and
7. calculates cumulative metrics from the same retained evidence.

Current assertions are supplemental and only apply at Today/latest. Missing transitions are not invented. Event count may exceed entity count because one entity can have several lifecycle records.

## Architecture

| Layer | Implementation |
| --- | --- |
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| Client state | Zustand with persisted workspace preferences |
| Server state | TanStack Query |
| Native backend | Rust Tauri commands |
| GitHub access | OAuth device flow, GraphQL, and REST |
| Local persistence | SQLite plus selected browser/local preferences |
| Credentials | Operating-system credential store |
| Embedded web | Managed Tauri child webviews for GitHub |
| Tests | Vitest, Testing Library, Playwright, and Rust tests |

## Getting started

### Prerequisites

- A recent Node.js release
- [pnpm](https://pnpm.io/)
- Stable Rust toolchain
- Tauri 2 Windows prerequisites, including WebView2 and the Microsoft C++ build tools
- Optional: a GitHub OAuth App client ID with Device Flow enabled for authenticated mode

### Install

```powershell
pnpm install
```

### Run the desktop app

```powershell
pnpm tauri dev
```

Choose Demo Mode for deterministic offline evaluation, or connect GitHub and enter the OAuth client ID when prompted.

### Run the browser-only frontend

```powershell
pnpm dev
```

The browser-only Vite build is useful for frontend development and automated tests, but it cannot reproduce Tauri commands, credential storage, SQLite, native window behavior, or embedded child webviews.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite frontend |
| `pnpm tauri dev` | Start the complete desktop app |
| `pnpm build` | Type-check and build the frontend |
| `pnpm test` | Run frontend unit/integration tests |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm lint` | Run ESLint over TypeScript/React source |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Run Rust tests |

## Continuous Integration

Pull requests and pushes to `main` run four required checks: **Frontend Quality**, **Rust Quality**, **Playwright E2E**, and **Windows Tauri Build**. CI has read-only repository permission and never creates or publishes a release.

## Releases

A matching semantic-version tag such as `v0.1.0` builds one draft release with Windows x64, Linux x64, macOS Apple Silicon, and macOS Intel assets. The tag must match the versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Apple Silicon and Intel are separate architecture-verified DMGs.

Release builds are unsigned and are not notarized. Windows may show an unrecognized-publisher warning, and macOS users may need to approve Snow Devil in **System Settings → Privacy & Security**. Only the release workflow's final publication job receives write permission.

## Latest verification

The current branch was checked with:

| Check | Result |
| --- | --- |
| Frontend production build | Pass |
| Frontend unit/integration | 99 files, 450 tests passed |
| Playwright | 49 tests passed, 1 skipped |
| Rust | 69 tests passed |
| ESLint | 0 errors; existing warnings remain |
| Diff whitespace check | Pass |
| Native Tauri layouts | Verified at 1280×720, 1600×900, and 1920×1080 |

Native checks covered History playback and Source Details at all target widths, Escape/focus restoration, inspector compression, fixed-page reactivation, refresh-with-snapshot, Reduced Motion stepping, Asia/Karachi cutoff agreement, focused Flow scrolling, and responsive Cumulative Flow sizing.

## Current limitations

- Snow Devil's native GitHub integration is read-only. It does not merge PRs, submit reviews, post comments, edit issues, rerun workflows, or trigger releases/deployments.
- GitHub permissions, pagination, retention, API support, and organization authorization determine available evidence.
- History cannot reconstruct events GitHub did not expose; incomplete sources remain partial.
- Repository tree filtering is not a replacement for complete GitHub code search.
- Very large expanded trees and extremely large history result sets may still benefit from additional virtualization.
- Native diff focuses on textual patches and does not provide GitHub's complete review workflow.
- Business-time calculations do not currently include public holidays.
- The primary supported experience is the packaged Windows application; release signing, updater, and broad clean-machine qualification remain follow-up work.
- Team workspaces, shared dashboards, cloud synchronization, role-based access, and multi-account operation are not implemented.

## Design principle

Snow Devil does not replace GitHub. It gives you a local place to see what is happening, follow work through its history, and spot where the available data is incomplete.
