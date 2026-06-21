# Individual-Account MVP Implementation Report

## 1. Architecture Audit

- Native pages use `NativeTabKind`, `SIDEBAR_SHORTCUTS`, `WorkspaceContent`, and the existing workspace tab strip.
- Home and Flow use production `FlowItem` records and per-tab Zustand selection/playback state.
- Simulators use normalized `SimulatorEvent` history, SQLite cache commands, and `reconstructState`.
- Inspector selection is stored by tab in `flow-store` and browser destinations open through `tabs-store`.
- SQLite schema v3 already contains normalized nodes, edges, settings, simulator events, and sync state.
- No chart dependency existed, so the new charts use lightweight responsive HTML/SVG rendering.
- Analytics settings follow the app's existing versioned Zustand/localStorage persistence pattern.

## 2. New Domain Types

`src/analytics/types.ts` adds delivery entities, events, branches, relationships, lineage confidence, repository capabilities, settings/overrides, CI health, Inventory, lead-time samples, and Inspector view models.

## 3. Database and Schema

No migration was required. Live analytics consume the existing v3 normalized simulator-event cache and repository nodes. Existing data remains readable and reset behavior is unchanged.

## 4. Tauri Commands

No Tauri commands changed. The live provider uses existing `get_simulator_events` and `get_all_repositories` commands. Demo Mode never invokes these data commands.

## 5. GitHub API and Incremental Sync

No new broad account crawl was added. Connected analytics read bounded local history populated by existing sync/simulator flows, refetch only the cache on page refresh, and explicitly report partial coverage. This avoids fetching every branch, check, release, and deployment on launch.

## 6. CI Health Rules

- Excellent: no branch over threshold, recent integration activity, and at least five integrations/week.
- Good: no critical branch signal, with minor inactivity or lower cadence.
- Warning: branch over threshold, stale trunk activity, or cadence below one integration/week.
- Poor: multiple branches above 3x threshold, or at least three aging branches plus prolonged trunk inactivity.
- Every grade stores human-readable contributing reasons for Inspector display.

## 7. Branch Lifetime and Business Time

Lifetime is first observed/first unique commit to merge/deletion, or to the dataset reference time for active branches. Default branches are excluded. Estimated observations remain marked. Business hours exclude configured non-working weekdays in the configured timezone; Inventory uses the same calendar and shared age bands.

## 8. Flow Analytics Definitions

- Cumulative Flow: daily stage snapshots reconstructed from entity milestone timestamps.
- Throughput: merged PRs, closed issues, releases, and successful deployments in daily/weekly buckets.
- Lead time: configured timestamp pairs with median, P75, P90, sample size, and IQR outliers.
- Frequency: selected-range deployment/release totals divided by selected weeks.

## 9. Inventory Classification

Deterministic rules cover merged-not-released, merged-not-deployed, deployed-not-released, released-not-deployed, review waits, changes requested, pending/failing checks, ready-not-merged, stale branches/drafts, and closed-unmerged work. Repository capability flags prevent unsupported release/deployment semantics from being assumed.

## 10. Lineage and Confidence

`buildDeliveryLineage` prefers existing explicit relationships, then explicit issue/PR evidence, matching repository/number, matching branch refs, and bounded temporal release/deployment inference. Relationships store `exact`, `strong`, `inferred`, or `unknown` confidence plus the evidence text.

## 11. Personal Focus Rules

Current WIP includes active issues, branches, and PRs. Awaiting You uses changes requested, failed checks, and stale owned drafts. Awaiting Others uses requested reviews and pending checks. The normal WIP baseline is the median 60-day concurrent workload; warnings require current WIP to exceed both an absolute and proportional margin.

## 12. Settings and Defaults

Versioned persisted settings cover repository inclusion, archived/fork/private handling, bots, Dependabot, Renovate, drafts, default range, timezone/business days, branch and Inventory thresholds, stale trunk allowance, retention, refresh interval, matching strategy, minimum percentile samples, and repository overrides. Reset requires an explicit confirmation step.

## 13. Demo Coverage

The fixed `2026-06-21` analytics generator supplies 90 days of four-repository history, all CI grades, direct pushes, active/closed branches, cumulative queue changes, throughput, lead-time outliers, releases, deployments, partial evidence, every Inventory age band, WIP above norm, waiting classifications, failed checks, and recent activity. Account simulator history deterministically adds 14 merged entities, producing the exact `+11 more` case. Reset produces identical IDs and no duplicates.

## 14. `+N more`

`SimulatorStageColumn` renders four preview cards and a real, labeled button. Expansion is stage-specific and context-keyed, reveals all local cards in deterministic order, keeps the stage vertically scrollable, does not fetch, and preserves cursor, playback, and selection. Home uses the same local-expansion behavior; genuinely paginated live previews hand off to Flow.

## 15. Tooltip Clamping

`SimulatorTimeline` measures the track and tooltip, computes `cursorX - tooltipWidth / 2`, clamps the left edge between a four-pixel inset and `trackWidth - tooltipWidth - inset`, and recomputes with `ResizeObserver`. Long labels wrap within the track instead of truncating.

## 16. Open in Tab

`resolveEntityTabTarget` is the single resolver for Home, Flow, analytics, Account Simulator, and Repository Simulator. It validates explicit HTTPS GitHub URLs and derives issue/PR/repository/release/branch targets only from sufficient identity. Opening a browser tab leaves the source tab's Zustand playback and selection untouched. Synthetic Demo entities show a disabled explanation and never expose a fake URL.

## 17. Main Modified Areas

- `src/analytics/*`: domain, demo history, business time, math, lineage, selectors, live adapter, tests.
- `src/components/analytics/*`: four pages, Settings, shared UI/CSS, page tests.
- `src/components/simulator/*`: reusable overflow stage and measured timeline.
- `src/components/inspector/*`, `src/lib/entity-target.ts`: shared evidence and target path.
- `src/browser/*`, `WorkspaceContent.tsx`: native tab/navigation integration.
- `src/data/demo-provider.ts`, `Dashboard.tsx`, stores/hooks, and focused tests.

## 18. Tests Added

Tests cover business time, age bands, percentiles, outliers, CI grading, streaks, cumulative flow, throughput, lead time, Inventory reasons, repository overrides, lineage confidence, target resolution, all tooltip endpoints/resize/long width, exact overflow expansion, page rendering/filtering, settings reset, and four simulator issue/PR state-preservation cases.

## 19. Validation

- `pnpm test`: 23 files, 133 tests passed.
- `pnpm build`: passed.
- `pnpm lint`: passed with 23 pre-existing hook warnings; no errors.
- `pnpm test:e2e`: 5 passed.
- `cargo test`: 51 passed.
- `cargo check`: passed with one pre-existing unused-import warning.
- `git diff --check`: passed.

## 20. Performance

Selectors run against one normalized dataset and are memoized at page boundaries. Business weekday formatting is cached by timezone/hour. Charts are dependency-free DOM/SVG. Live history is bounded and cache-first; no account-wide reconstruction runs on every render.

## 21. Known Limitations

- Connected analytics are only as complete as locally cached simulator/sync history. There is not yet a dedicated staged account-wide branch/release/deployment backfill.
- Public-holiday calendars are excluded from MVP business time.
- Release/deployment temporal matches remain explicitly `inferred` without SHA/tag evidence.
- Standalone Vite browser runs log expected Tauri-bridge errors; packaged Tauri and mocked automated tests provide the bridge.

## 22. Screenshots

All requested captures are in `screenshots/`:

- `ci-health-1920x1080.png`, `ci-health-1280x800.png`
- `flow-analytics-1920x1080.png`, `flow-analytics-1280x800.png`
- `inventory-1920x1080.png`, `inventory-1280x800.png`
- `personal-focus-1920x1080.png`, `personal-focus-1280x800.png`
- `expanded-pipeline-stage.png`
- `simulator-cursor-left-edge.png`, `simulator-cursor-right-edge.png`
- `account-simulator-open-in-tab.png`, `repository-simulator-open-in-tab.png`

## 23. Scope Confirmation

No team, organization-collaboration, pairing, shared planning, or multi-user management features were added.

## 24. Git Confirmation

No commit or push was performed. All changes remain in the working tree for review.
