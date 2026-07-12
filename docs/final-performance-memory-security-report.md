# Final performance, memory, and security pass

Date: 2026-07-12  
Branch: `feat/final-performance-memory-security-pass`

## Scope and qualification limits

This pass concentrated on the reproducible Delivery Risks activation freeze, native-tab ownership, lazy restoration, and the in-app browser trust boundary. Measurements below are from Chromium against the Vite demo build on the qualification machine. The environment did not provide an automated native Windows memory profiler or a connected large live GitHub account, so Rust RSS, live SQLite counts, ten-minute native-webview stress, and large-private-repository timings remain manual qualification items. No values were invented for those cases.

## Baseline

| Path | Reproduction and observed cause | Baseline evidence |
| --- | --- | --- |
| Delivery Risks first open | Open the native Delivery Risks tab. Full classification, grouping, filtering, and sorting executed in the React render path after the cached SQLite payload was normalized. | No dedicated loading paint existed for the computation. Exact pre-change click timings were not captured before remediation; code inspection identified the synchronous `deliveryRiskInventoryAnalysis` call in render. |
| Delivery Risks return | Open Delivery Risks, switch away, return. | The component-local memo was lost if remounted; if retained, the entire hidden component tree stayed subscribed and rendered. There was no cross-mount derived cache. |
| Native multi-tab and restore | Restore or open several native tabs. | `WorkspaceContent` mapped every native tab into a mounted React tree and used only the HTML `hidden` attribute. Thus restored Flow, CI, history, architecture, repository, and Delivery Risks trees could initialize eagerly and retain listeners/query observers. |
| Browser URL boundary | Navigate a URL classified as GitHub. | Frontend detection used a prefix regular expression that accepted `github.com.evil.example`; Rust accepted every `*.github.com` host inside the privileged in-app webview. |
| Bundle | Production build. | Main JS chunk after the pass is 605.24 kB (179.73 kB gzip); this remains above Vite's 500 kB warning threshold. Delivery Risks is lazy (25.15 kB) and its worker is a separate 30.47 kB asset. |

The baseline unit run passed 441 tests and failed nine Repository Explorer tests because those tests mount `useIsFetching` without a `QueryClientProvider`. This was present before the changes in this pass. Lint initially reported one error and 67 warnings; the error was an in-place mutation of hook-derived Flow data.

## Fixes

| Module | Cause | Change and boundary | Cancellation/cache/tests |
| --- | --- | --- | --- |
| `WorkspaceContent`, `DeferredSurface`, `WorkspaceLoadingState` | Hidden native tabs stayed fully mounted; activation could begin expensive render work before a loading frame. | Only the active native tree is mounted. Heavy surfaces yield through an animation frame and task before mounting, allowing the shared Home spinner/text language to paint first. The loader is accessible and reduced-motion safe. | Switching or closing before activation clears the frame/timer. Unmount owns cleanup of view effects and query observers. `DeferredSurface.test.tsx` covers immediate loader and cancellation. |
| `delivery-risk.worker.ts`, `delivery-risk-cache.ts`, `InventoryPage` | Delivery Risks classification ran synchronously during React render and repeated after remount. | Live immutable query snapshots are structured-cloned to a dedicated Web Worker. This is the right boundary because the derivation is pure TypeScript over frontend-resident data; moving it to Rust would add IPC/schema duplication and another large serialization round trip. Demo's deliberately small deterministic dataset remains synchronous. | Worker is terminated on identity change/unmount/error/success. Completed models use nested `WeakMap` caches, so query eviction releases keys and warm activation reuses the exact model. Unit coverage verifies cache hit/invalidation. |
| `WorkspaceContent` lifecycle | Restored tabs initialized eagerly and inactive tabs retained heavy resources. | Restored heavy native tabs remain metadata-only until active. The lightweight fixed Home singleton stays mounted to preserve its required scroll semantics. Active identity is canonicalized by the existing tab store; duplicate opens focus existing tabs. | Inactive heavy trees cannot poll, lay out, or retain component-owned workers/listeners. View state already owned by persisted scoped stores remains reusable. |
| `browser-url.ts`, Rust browser security | Prefix/subdomain trust allowed lookalike or unreviewed hosts into GitHub classification/in-app webviews. | Host parsing now uses exact trusted hosts: `github.com`, `www.github.com`, and `gist.github.com`. Other HTTP(S) destinations remain external. | TypeScript and Rust regression tests reject lookalike and unlisted subdomain hosts; dangerous schemes remain blocked. |
| `FlowWorkbench` | A hook-derived item was mutated in place, breaking immutability/selector assumptions. | Creates a copy only when an inclusion reason is missing. | Lint hard error removed; source object identity is no longer mutated. |

Flow Analytics remains disabled through the existing compile-time capability gate and is neither imported nor mounted while disabled.

## After results

Automated activation instrumentation observes DOM mutation from the actual captured click event, so Playwright actionability overhead is excluded.

| Delivery Risks demo activation | Click to loader | Click to usable `Active Risks` | Budget |
| --- | ---: | ---: | --- |
| Cold | 19.1 ms | 334.5 ms | Loader <100 ms: pass |
| Warm after Home switch | 13.1 ms | 74.8 ms | Warm <150 ms: pass |

The performance regression test asserts loader <100 ms, cold usable <1 s, and warm usable <150 ms. It also proves the loader mutation precedes usable content. The existing Delivery Risks E2E scenarios both pass (2/2, 7.9 seconds total).

Resource ownership after the fix is structural and test-backed: at most one heavy native React surface is mounted alongside the lightweight fixed Home singleton, a pending activation owns one animation frame and at most one timeout, and a live Delivery Risks activation owns at most one worker. Each is cancelled on unmount. Weak caches do not keep datasets or settings alive. Native browser webviews continue to use their existing bounded six-resident-view pool.

## Verification

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | Pass |
| `pnpm test` | 441 passed; nine pre-existing Repository Explorer provider failures |
| Targeted changed-area tests | 65 passed |
| `pnpm build` | Pass; existing main-chunk and mixed dynamic/static import warnings retained |
| `pnpm run lint` | No errors after the immutable Flow fix; 67 pre-existing warnings remain |
| Delivery Risks E2E | 3 passed including measured cold/warm activation |
| Full E2E | 45 passed, one skipped, five failed; the two Home regressions were fixed and their focused rerun passes. Remaining failures: two tests require intentionally disabled Flow Analytics, and Repository Explorer returns its existing "No architectural changes" state instead of Component Index. |
| `cargo check` | Pass |
| `cargo test` | 69 passed |
| `cargo fmt --check` | Fails on two pre-existing formatting-only lines in `commands/repo.rs` and `github/repo_api.rs` |
| `git diff --check` | Pass |
| `pnpm audit --audit-level high` | No known vulnerabilities |
| `cargo audit` | Two high advisories in transitive `quick-xml 0.39.4`; 18 allowed maintenance/unsoundness warnings |

The `quick-xml` advisories arrive through `plist -> tauri-utils` and require `quick-xml >=0.41`, outside the compatible transitive range currently selected by Tauri. On Windows the vulnerable XML parsing paths are not fed repository/GitHub content by Snow Devil. A forced core Tauri dependency override was not made in this focused pass; update when the upstream Tauri/plist chain releases a compatible version. The `anyhow` and GTK/unic warnings are likewise transitive framework/platform findings rather than Snow Devil input paths.

## Remaining limits and manual matrix

- Live analytics payload normalization after the three SQLite calls still occurs in frontend async continuation code. Delivery Risks classification is off-thread, but normalization should be profiled with a genuinely large connected account before deciding whether to move that pipeline into Rust or another worker.
- Native SQLite commands share one mutex-backed connection. Queries are parameterized, but very large live histories may contend with synchronization. A pool/read connection and paged summary API are future candidates only after native trace evidence.
- Repository Explorer remains the largest lazy surface at 197.89 kB gzip 61.29 kB; main startup JS remains 179.73 kB gzip.
- Diff parsing and full Architecture Context analysis were already bounded/lazy in several places but were not measured against a qualification-scale PR/graph in this environment.
- Exact heap/RSS return after 50 close cycles, listener/native-task counters, Windows scaling at 100/125/150/200%, offline/slow-network live behavior, and ten-minute 10-tab native/webview stress require a packaged Tauri run with DevTools/native process telemetry. They are not claimed as passed here.
- Unmounting inactive native trees deliberately trades retained DOM state for resource release. Selection and scroll that are stored in the existing per-tab stores/local persistence survive; purely component-local scroll positions may reset and should be promoted to scoped view state only where product testing proves it necessary.
