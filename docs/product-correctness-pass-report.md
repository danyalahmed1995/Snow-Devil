# Snow Devil Product Correctness Pass

## Implementation summary

This pass centralizes lifecycle, attention, actor, confidence, activity, and work-item identity semantics and applies them across Home, Flow, Inventory, Personal Focus, analytics, and both simulators. It also replaces native-looking selects with one accessible themed control, coordinates global overlays with child webviews without reloading them, adds consistent browser actions and tab behavior, reorganizes Settings, and makes unavailable/unknown/partial states explicit.

## File-by-file change summary

### Shared semantics and data

- `src/lib/delivery-semantics.ts` — canonical lifecycle precedence, attention reasons, actor classes, activity/dormancy, confidence, and unique work-item identity.
- `src/lib/structured-search.ts` — shared token parser and matcher for repository, author, labels, stage, checks, review, type, reason, confidence, relationship, branch, SHA, age, and issue/PR number.
- `src/lib/workflow-presentation.ts` — consumes canonical lifecycle/attention/actor/search semantics for Home and Flow.
- `src/types/flow.ts` — adds confidence, attention, actor, activity, and missing-evidence fields.
- `src/simulator/simulator-reducer.ts` — reclassifies simulator entities through the same lifecycle function after every event.
- `src/simulator/simulator-github-api.ts` — preserves safe, non-sensitive failure messages and avoids logging GitHub payloads.
- `public/demo-data/simulator/account-history.json` — adds the successful-check evidence required for the Ready fixture.
- `src/lib/flow-mapping.test.ts`, `src/lib/flow-replay.test.ts`, `src/lib/workflow-presentation.test.ts` — align prior expectations with the canonical semantics.

### Analytics

- `src/analytics/types.ts` — standard confidence/status vocabulary, capability metadata, corrected lead-time interval, definitions, samples, and coverage fields.
- `src/analytics/live-adapter.ts` — detects release/deployment capability only from available evidence and propagates actor/confidence.
- `src/analytics/selectors.ts` — deduplicates inventory and completion events, aggregates workflow/check evidence under linked PRs, separates review/check stages, applies deployment precedence, and reports unknown instead of zero.
- `src/analytics/math.ts` — adaptive minute/hour/day duration formatting.
- `src/analytics/lineage.ts` — corrected release-to-deploy lineage.
- `src/analytics/sync.ts` — includes the expanded settings in the sync fingerprint.
- `src/analytics/selectors.test.ts` — updates selector expectations.
- `src/analytics/product-correctness.test.ts` — semantic deduplication, missing deployment evidence, unique completion, and 100-repository/5,000-item coverage.
- `src/components/analytics/AnalyticsShared.tsx` — accessible sync funnel, distinct empty states, partial details, and refresh behavior.
- `src/components/analytics/CIHealthPage.tsx` — unknown/actionable CI states, custom ranges and thresholds, definitions, samples, and stale-inspector clearing.
- `src/components/analytics/InventoryPage.tsx` — explicit views, unique item counts, actor/type/reason filters, structured search, and coverage context.
- `src/components/analytics/FlowAnalyticsPage.tsx` — unique completion semantics, custom ranges, grouping, corrected lead intervals, inspectable metrics/charts, axes, samples, and unsupported states.
- `src/components/analytics/PersonalFocusPage.tsx` — active versus dormant work, default bot exclusion, aging/action separation, and actionable focus controls.
- `src/components/analytics/AnalyticsSettingsPage.tsx` — reorganized settings, validation, bot controls, split matching strategies, searchable repository overrides, inheritance, and destructive confirmations.
- `src/components/analytics/Analytics.css` — layout and state styling for the revised analytics/settings surfaces.
- `src/components/analytics/AnalyticsPages.test.tsx` — shared-select and destructive-confirmation coverage.
- `src/stores/analytics-settings-store.ts` — additional bot, matching, and reduced-motion settings.

### Shared UI, overlays, browser actions, and tabs

- `src/components/ui/Select.tsx`, `src/components/ui/Select.css` — one themed portal listbox with searchable mode, keyboard navigation, selected markers, disabled reasons, focus styling, and Escape behavior.
- `src/stores/overlay-store.ts` — single active global-overlay coordinator.
- `src/browser/BrowserViewport.tsx` — hides child webviews while overlays are open and reactivates the same resident page afterward without reload.
- `src/browser/BrowserHydrator.tsx` — removes repository-derived diagnostic logging while preserving hydration behavior.
- `src/lib/browser-actions.ts` — validates canonical GitHub HTTPS URLs for external-open and clipboard actions.
- `src/components/palette/CommandPalette.tsx`, `src/components/theme/AppearanceMenu.tsx`, `src/components/auth/AuthModal.tsx` — participate in global overlay coordination and Escape handling.
- `src/components/theme/ThemeSelect.tsx` — uses the shared Select.
- `src/components/theme/ThemeProvider.tsx`, `src/styles/globals.css` — apply reduced-motion preference globally.
- `src/components/repository/RepositoryExplorer.tsx`, `src/components/workspace/RepositorySelector.tsx` — replace native selects with the shared control.
- `src/components/layout/TopBar.tsx` — consistent safe default-browser and copy-link actions.
- `src/components/layout/Layout.tsx`, `src/components/layout/Layout.css`, `src/stores/layout-store.ts` — contextual Inspector collapse/open behavior and resizable separation.
- `src/components/inspector/Inspector.tsx` — definitions, coverage, missing evidence, historical/current simulator state, and consistent browser actions.
- `src/components/inspector/InspectorWorkflow.test.tsx` — updated Inspector behavior.
- `src/stores/tabs-store.ts` — canonical URL reuse, closed-tab history, reopen, close-right/others, reorder, and browser cleanup.
- `src/components/workspace/WorkspaceTabStrip.tsx`, `src/components/workspace/Workspace.css` — native/browser distinction, drag reorder, context/overflow actions, reopen, and Ctrl+Tab.
- `src/stores/tabs-close.test.ts` — tab reuse, reopen, and close-action coverage.
- `src/browser/BrowserViewport.overlay.test.tsx` — verifies overlay hide/reactivate without browser recreation.
- `src/components/ui/Select.test.tsx`, `src/components/theme/ThemeSelect.test.tsx` — keyboard, theme, and focus behavior.
- `vitest-setup.ts` — mocks the external opener for UI tests.

### Home, Flow, and simulator

- `src/components/workspace/Dashboard.tsx`, `src/components/workspace/Dashboard.css` — explainable metrics, freshness, active/completed pipeline grouping, repository ranking reasons, and richer merge evidence.
- `src/components/workspace/Dashboard.test.tsx` — updated Home labels.
- `src/components/workspace/FlowWorkbench.tsx`, `src/components/workspace/FlowWorkbench.css` — shared filters/search, custom range, actor/involvement filtering, stage focus, snapshot context, and removal of dead Live/Replay controls.
- `src/components/workspace/FlowPipeline.tsx` — hide-empty, focused stage, bounded loading copy, and selected-item expansion/scroll.
- `src/components/workspace/FlowCard.tsx` — confidence badge.
- `src/components/workspace/FlowWorkbench.test.tsx` — shared-select and control-removal coverage.
- `src/stores/flow-store.ts` — expanded persistent Flow/filter state.
- `src/components/simulator/SimulatorWorkbench.tsx`, `src/components/simulator/SimulatorWorkbench.css` — working cross-panel filters, custom range, partial-history detail, event navigation, shared speed Select, and Jump to latest.
- `src/components/simulator/ui/SimulatorEventStream.tsx` — removes the false Live indicator.
- `src/hooks/useSimulatorPlayback.ts` — atomic meaningful-timestamp stepping and playback.
- `src/hooks/useSimulatorPlayback.test.ts` — step/play/speed/atomic-cursor coverage.
- `src/hooks/useAccountSimulator.ts`, `src/hooks/useRepositorySimulator.ts`, `src/hooks/useReplayBuffer.ts` — privacy-safe failures and replay behavior.
- `src/lib/delivery-semantics.test.ts`, `src/lib/structured-search.test.ts` — canonical semantics and parser coverage.

## Shared abstractions

- `classifyLifecycle`
- `classifyAttention`
- `classifyActor` / `isActorIncluded`
- `classifyActivity`
- `confidenceFromEvidence`
- `uniqueWorkItemIdentity`
- `parseStructuredSearch` / `matchesStructuredSearch`
- `Select`
- `useOverlayStore`
- `openInDefaultBrowser` / `copyCanonicalLink`

## Semantic definitions

- Terminal precedence is `deployed > released > merged > closed`.
- Draft pull requests remain in Coding even if stale check evidence exists.
- Changes requested outranks successful checks and places work in Review.
- Failed/running required checks place non-draft work in Checks.
- Approved plus successful required checks is Ready.
- Approved with missing check evidence is blocked in Checks, not Ready.
- Missing release/deployment capability is Unavailable, never numeric zero.
- Inventory identity is repository + entity type + issue/PR number (or stable source ID when no number exists).
- Repeated workflow/check failures aggregate into the linked work item.
- Active, aging, stale, and dormant are distinct; dormant work is excluded from active WIP.
- Human, Dependabot, Renovate, other bot, and unknown actors are distinct.
- Confidence is one of `exact`, `matched`, `inferred`, `partial`, `unlinked`, or `unavailable`.
- Completion counts are unique entity/type/time-bucket events, not raw evidence rows.
- Lead time includes the corrected `Released → deployed` interval.

## Tests

Run:

```powershell
pnpm test
pnpm lint
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

Final verification:

- 44 Vitest files, 208 tests.
- 53 Rust tests.
- ESLint exits successfully with 35 existing non-blocking React hook warnings.
- TypeScript and Vite production build succeed.

## Manual validation

- Home: verify explainable attention cards, active/completed pipeline grouping, freshness, repository reasons, and merge evidence.
- Flow: verify scope/repository/involvement/actor/stage filters, structured search, custom range, hide-empty, selection auto-scroll, and no dead Live/Replay controls.
- CI Health: verify unknown differs from warning, custom threshold/range, metric definitions, samples, and refresh/partial states.
- Inventory: verify one row per work item, evidence aggregation, explicit view/type/reason filters, structured search, and selection clearing.
- Flow Analytics: verify cumulative/throughput/lead tabs, unique completion labels, unavailable checks wait, samples, axes, end-of-day note, and `Released → deployed`.
- Personal Focus: verify dormant and bot work are excluded by default and focus actions update the visible model.
- Account/Repository Simulator: verify filters update board, entity list, event stream, and metrics together; Step/Play/Speed; Jump to latest; event selection; historical/current Inspector.
- Settings: verify grouped sections, validation bounds/units, bot dependencies, reduced motion, repository override search/inheritance, cache reset wording, and full-reset phrase confirmation.
- Tabs/overlays: verify Ctrl+K, Appearance, auth/dialogs, tab context menu, reorder/reopen/close actions, and that browser history/scroll remain after overlay close.

## Performance notes

- Analytics inventory aggregation uses `Map`-based identity/link indexing.
- Inventory/filter derivations are memoized.
- Structured search parses once per query and matches normalized fields.
- Settings repository overrides are searchable and render at most the first 250 matches.
- Simulator playback groups events by unique meaningful timestamp for atomic updates.
- Browser startup continues to hydrate a bounded resident set in small batches.
- The large-dataset regression covers 100 repositories and 5,000 normalized inventory items.

The Inventory table and Settings list do not yet use viewport virtualization; Settings uses bounded rendering, and Inventory relies on memoized filtering. The production JavaScript bundle is about 715 KB minified (about 212 KB gzip), so route-level code splitting remains worthwhile.

## Security and privacy verification

- OAuth tokens remain in the OS credential store through Rust `keyring`.
- Client diagnostics no longer include repository-derived hydration IDs, titles, GraphQL payloads, or simulator entity numbers.
- External-open and copy actions accept canonical safe GitHub HTTPS URLs.
- Reset commands have Rust coverage for idempotence and credential-preserving cache reset.
- Overlay coordination hides child webviews, preventing click/key leakage to a covered page.

## Known evidence limitations

- Check wait is Unavailable when check start/end pairs were not cached.
- Release/deployment metrics are Unavailable or partial when repositories do not expose explicit supporting evidence.
- Branch start may be inferred from the first observed commit when branch creation is unavailable.
- GitHub search/timeline pagination remains bounded, and partial coverage is shown when that boundary is reached.
- Browser-only Vite validation lacks the Tauri bridge; bridge errors in that harness are expected and do not occur in the native shell.

## Browser state confirmation

`BrowserViewport.overlay.test.tsx` verifies that opening a global overlay calls `browserHideAll`, closing it reactivates the same tab, and no new browser page is created. The resident webview therefore keeps its navigation history and scroll state.

## Screenshots

- `screenshots/correctness-account-simulator.png`
- `screenshots/correctness-simulator-filters.png`
- `screenshots/correctness-settings.png`
- `screenshots/correctness-flow-analytics.png`
