# Account Simulator, Tab Menu, and Repository Tree Follow-Up Report

Date: 2026-06-26

## 1. Account Simulator root cause

The Account Simulator failure was specific to the account-wide loading path, not the shared simulator UI or repository replay engine.

The failing stage was account history refresh/cache recovery:

- `fetchAccountActivity` treated account collection as all-or-nothing, so a single account source/API/normalization failure could reject the entire simulator load.
- The hook/UI collapsed every caught error into the same user-facing “Network failure loading simulator data.” state, which hid authentication, rate-limit, invalid-payload, cache, normalization, and replay-construction failures.
- Account cache recovery looked up `account:${login}`, while available simulator history could be stored as repository-scoped activity, so a valid previous snapshot was not always usable after a fresh refresh failed.
- Account simulator event IDs were not repository-scoped, so cross-repository issue/PR numbers could collide during replay construction.

Repository Simulator continued to work because it uses the repository-scoped fetch/cache path and was not dependent on the account-wide aggregation failure.

## 2. File-by-file summary

- `src/simulator/simulator-errors.ts`: added safe simulator error classification, retryability, user-facing titles/explanations, and redacted diagnostics.
- `src/simulator/simulator-types.ts`: added load-detail and source-failure types used by account/repository simulator screens.
- `src/simulator/account-simulator-loader.ts`: added resilient account snapshot loading with cache-first recovery, fresh source refresh, partial-source details, cache incompatibility handling, and replay construction validation.
- `src/simulator/simulator-github-api.ts`: added coverage-aware account activity fetching across authored, assigned, review-requested, reviewed, and commented sources; failures are source-local unless no usable source remains; account subject IDs are repository-scoped.
- `src/simulator/simulator-cache.ts`: preserves already-scoped/non-legacy subject IDs when reading cached simulator history.
- `src/hooks/useAccountSimulator.ts`: switched Account Simulator to the loader and returns safe `details`, stale cache status, retry, and error classification.
- `src/hooks/useRepositorySimulator.ts`: returns compatible load details while preserving the repository simulator path.
- `src/components/simulator/SimulatorWorkbench.tsx`: added retryable safe error UI, stale/partial coverage banners, source/cache failure details, and tab-refresh registration.
- `src/components/simulator/SimulatorWorkbench.css`: styled partial, stale, and failure states.
- `src/lib/tab-refresh.ts`: added the centralized tab refresh registry and browser/native refresh dispatch.
- `src/hooks/useTabRefresh.ts`: added a small hook for native pages to register refresh handlers.
- `src/components/workspace/WorkspaceTabStrip.tsx`: added `Refresh tab`, capability checks, browser/native dispatch, menu keyboard navigation, viewport clamping, focus restoration, and dismissal handling.
- `src/components/workspace/Workspace.css`: added menu styling, disabled/message states, and focus polish.
- `src/components/workspace/Dashboard.tsx`: registers Home refresh for summary/recent repositories/sync state.
- `src/components/workspace/FlowWorkbench.tsx`: registers refresh for current flow queries.
- `src/components/analytics/AnalyticsShared.tsx`: added shared analytics tab-refresh registration helper.
- `src/components/analytics/CIHealthPage.tsx`, `InventoryPage.tsx`, `FlowAnalyticsPage.tsx`, `PersonalFocusPage.tsx`: register analytics refresh for current page state.
- `src/components/analytics/AnalyticsSettingsPage.tsx`: registers settings refresh for analytics and sync metadata.
- `src/repository/repository-tree-icons.ts`: added centralized, dependency-free repository tree icon resolution.
- `src/components/repository/TreeFileIcon.tsx`: renders mapped Lucide icons with accessible labels and `data-tree-icon` diagnostics.
- `src/components/repository/RepositoryExplorer.tsx`: added `TREE` label, distinct root row, connector guides, keyboard navigation, local filter behavior, branch-specific cache clearing, and shared refresh registration.
- `src/components/repository/RepositoryExplorer.css`: added tree label/root/icon/connector/scrollbar styling.
- `src/simulator/account-simulator-loader.test.ts`: added account simulator recovery regression tests.
- `src/components/workspace/WorkspaceTabStrip.test.tsx`: added tab refresh and dismissal regression tests.
- `src/repository/repository-tree-icons.test.ts`: added icon mapping tests.
- `src/components/repository/RepositoryExplorer.test.tsx`: added repository tree presentation/filter/navigation tests.

## 3. Partial-success and cache fallback behavior

Account loading now follows this shape:

1. Read any valid cached account simulator snapshot.
2. Fetch fresh account sources independently.
3. Keep successful sources and record failed sources with safe categories.
4. Normalize usable events and validate replay construction.
5. Render the partial snapshot when at least one usable source remains.
6. If fresh loading fails but cache is valid, render the stale cache and show the refresh failure separately.
7. If cache parsing fails, report only the simulator cache incompatibility and rebuild from available fresh sources.

The cache is not deleted automatically, and unrelated local settings, tabs, browser state, auth state, and repository explorer state are not reset.

## 4. Safe error categories introduced

- `authentication`
- `rate_limit`
- `network`
- `partial_source`
- `invalid_response`
- `cache_incompatible`
- `normalization_failed`
- `replay_construction_failed`
- `unknown`

The UI shows safe titles/explanations. Local diagnostics retain the category and stack shape while redacting GitHub URLs and avoiding payload/token logging.

## 5. Tab refresh behavior

- Browser tabs: `Refresh tab` calls the browser reload path for the same tab ID/webview. It does not duplicate the tab, replace the app shell, or hard-reload the whole application.
- Native tabs: pages register a refresh handler through the shared registry. Refresh invokes only that page’s data reload path and preserves tab identity and local UI state where the page supports it.
- Tabs with no registered native refresh action expose a disabled `Refresh tab` item with an accessible reason.

## 6. Tab context menu dismissal triggers

The shared menu now dismisses on:

- pointer-down outside the menu;
- visible different-tab activation;
- active tab changes;
- opening another overlay;
- `Escape`;
- main window blur;
- resize;
- scroll/re-layout of the tab strip;
- the anchored tab being closed;
- opening a context menu for another tab.

The menu is rendered through the webview-aware overlay path and is clamped to the viewport.

## 7. Repository folder/file icon mapping

Folder mappings include generic closed/open folders plus `.github`, `.git`, `src`, `source`, `public`, `docs`, `documentation`, `scripts`, `test`, `tests`, `__tests__`, `assets`, `images`, `img`, `config`, `.config`, `build`, `dist`, `out`, `examples`, `samples`, `packages`, `components`, `styles`, and `css`.

File mappings include Markdown/MDX, JSON, YAML, TypeScript, JavaScript, Rust/Cargo, HTML, stylesheets, shell, PowerShell, Python, C/C++, C#, Java/Kotlin, Swift, images, media, package manifests, lockfiles, Git files, environment files, license files, readmes, binary files, and a generic fallback. Filename-specific rules take precedence over extensions.

## 8. Repository-tree performance strategy

- Directory children remain lazy-loaded.
- Loaded directory results are cached by repository, branch, and path.
- Branch changes clear/namespace branch-specific tree/search state and invalidate stale in-flight responses through generation counters.
- Local filtering uses currently loaded/demo entries and preserves expansion state instead of issuing a recursive REST tree request.
- Icon resolution is centralized and lightweight.
- File contents are still fetched only when a file is opened.
- Refresh uses the same repository tree reload path as the toolbar and tab menu.

## 9. Tests added and commands used

Added/updated tests:

- `src/simulator/account-simulator-loader.test.ts`
- `src/components/workspace/WorkspaceTabStrip.test.tsx`
- `src/repository/repository-tree-icons.test.ts`
- `src/components/repository/RepositoryExplorer.test.tsx`

Commands run:

```powershell
pnpm exec tsc --noEmit
pnpm vitest run src/simulator/account-simulator-loader.test.ts src/components/workspace/WorkspaceTabStrip.test.tsx src/repository/repository-tree-icons.test.ts src/components/repository/RepositoryExplorer.test.tsx
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
pnpm lint
```

## 10. Build, lint, and test results

- TypeScript: passed.
- Focused Vitest run: passed, 4 files / 30 tests.
- Full Vitest run: passed, 47 files / 234 tests.
- Vite build: passed. Existing warnings remain for mixed static/dynamic import of `browser-commands.ts` and a bundle chunk larger than 500 kB.
- Rust/Tauri tests: passed, 46 library tests + 7 integration tests.
- Lint: passed with 0 errors and 40 warnings. The warnings are React hook advisory warnings in existing components/hooks.

## 11. Manual verification performed

Using the local dev app at `http://127.0.0.1:1420/` in Demo Mode:

- Opened Account Simulator and confirmed it loads a replayable account timeline without the previous “Network failure loading simulator data.” dead-end.
- Confirmed Account Simulator shows history range, board columns, entities, controls, and refresh/playback UI.
- Opened Repository Explorer and confirmed the `TREE` label, distinct root row, mapped folder/file icons, and row accessibility metadata are visible.
- Expanded/filter-checked the repository tree; filtering `README` kept the tree context and did not trigger full-repository network search.
- Opened the tab context menu and confirmed `Refresh tab` appears.
- Confirmed clicking a visible different workspace tab dismisses the menu and activates that tab.

Keyboard Escape, window blur, overlay dismissal, and browser-tab reload behavior are covered by the automated tab-strip tests; the in-app browser automation harness was unreliable for synthetic keyboard events during manual validation.

## 12. Known limitations

- Repository tree filtering is intentionally local to loaded/demo entries. Full-repository server-side search is left separate for a future feature.
- Large-tree virtualization was not added because the current lazy-loaded tree does not eagerly materialize full repositories; the patch avoids the previous recursive filter fetch instead.
- Browser-tab refresh is verified by unit test/mocking and the shared reload path. Manual browser-tab reload was not fully exercised because the demo session’s browser tabs were off-screen and the local browser automation harness had keyboard/event-synthesis limitations.
- Existing lint warnings remain unchanged in spirit; they are warnings, not errors.
