# Architecture Context completion report

## Exact implementation

Architecture Context now builds a reusable repository snapshot for the exact PR base or selected repository commit before calculating PR impact.

Rust owns remote acquisition and persistence:

- `fetch_repository_architecture_input` fetches one exact recursive Git tree and then retrieves structural/source contents in batches of 60 GraphQL objects.
- Tree analysis is capped at 30,000 non-excluded files; content enrichment is capped at 360 files and 512 KB per source file.
- Generated/vendor defaults cover `node_modules`, `vendor`, `dist`, `build`, `target`, `coverage`, `.next`, `out`, `bin`, `obj`, `generated`, `third_party`, and `external`.
- Truncated trees, file/content caps, malformed YAML, and batch failures become warnings rather than crashes.
- `.snowdevil/architecture.yml` is parsed with normal YAML/comment support and returned as structured JSON for deterministic validation.
- SQLite migration 8 persists repository snapshots separately from PR impacts. Snapshot identity is repository + exact base SHA + algorithm v2 + config hash. Cache payloads are capped at 8 MB, with three snapshots per repository and five impacts per PR. Access timestamps are updated and manual refresh removes only the exact commit/version entry.
- Exact cached loads call SQLite only and make zero GitHub requests. A different commit uses a different query/cache key and cannot reuse the wrong snapshot.

TypeScript owns deterministic architecture inference:

- `repository-analyze.ts` discovers configured, manifest, workspace, build, and bounded directory components; maps repository files; calculates confidence; parses ordered CODEOWNERS; builds dependency edges; and produces precise ready/partial warnings.
- `useRepositoryArchitecture.ts` implements stable TanStack Query keys, exact cache-first loading, in-flight coalescing, stale-while-refresh behavior for repository exploration, and no hidden-surface subscription.
- `analyze.ts` maps PR changes against the repository snapshot, preserves renamed/deleted/unmapped files, detects new/removed/existing-touched import/include edges, calculates bounded direct and one-hop indirect blast radius from the repository graph, and produces explainable risk/confidence.
- `architecture-store.ts` keeps Inspector selection tab-scoped and removes empty state on unmount; a 50-tab switching test leaves zero retained entries.
- The `architecture_context` flag remains central. When disabled, neither PR nor repository architecture queries mount.

## Repository intelligence

Component boundaries use this priority:

1. validated `.snowdevil/architecture.yml` paths;
2. nearest project/build manifest and exact workspace member;
3. C/C++ source/build target boundaries;
4. conventional application/service/package/test directories;
5. top-level directory inference only when stronger evidence is absent.

Supported manifest/boundary evidence includes package.json/npm/pnpm/Yarn/Bun workspaces, Cargo, `.sln`/`.csproj`, Python packaging, Go modules/workspaces, Maven/Gradle, CMake, Make, Meson, and Bazel. Workspace dependency edges currently include JavaScript workspace package dependencies, Cargo path dependencies, Go workspace members, Gradle included projects, `.NET` project references, and safely matched CMake target links.

Source dependency evidence includes relative JS/TS imports, `.NET` project references, and C/C++ quoted local includes. C/C++ system headers are intentionally ignored. Local includes must resolve exactly or uniquely against the tree; unresolved includes create no invented edge. Existing base-commit dependencies whose evidence file changes are reported as `Existing dependency touched`.

CODEOWNERS searches `.github/CODEOWNERS`, root `CODEOWNERS`, then `docs/CODEOWNERS`, applies rules in order with the last match winning, maps owners to files, and aggregates only real matches to components. Historical authorship is not treated as ownership.

Ready snapshots have a complete non-truncated bounded tree and no acquisition/config warnings. Partial snapshots list concrete reasons such as truncated tree, content cap, inaccessible batch, invalid config, unsupported layout, or missing repository index. PR confidence combines mapping evidence with snapshot completeness; partial snapshots reduce the score.

## PR and repository UI

The native PR tab remains the flagship surface. It now waits for/cache-loads the exact repository snapshot, shows `Repository snapshot ready` when appropriate, reports the analyzed repository file count and commit evidence, uses repository dependencies for blast radius, and persists both the PR section and internal Architecture Context section.

The existing Repository Explorer now has Files and Architecture sections. Architecture shows component/dependency counts, mapping and ownership coverage, unmapped files, warnings, commit/time, refresh, component list, bounded dependency map, and Inspector selection. Hidden Files/Architecture surfaces do not keep architecture queries mounted.

The Inspector supports both PR impacts and repository component snapshots without replacing Details or Timeline.

## Exact component-map defect and fix

Cause: `ArchitectureContext.css` used the broad selector `.architecture-map__canvas svg` to size the graph's edge-layer SVG. Because Lucide icons are also SVG descendants, the rule applied `position:absolute; inset:0; width:100%; height:100%` to the `Network` glyph inside every component node. That overrode the JSX `size={12}`/`size={13}` attributes and expanded the icon across the node/canvas, producing the large bright white branch symbol visible in the original `Test Suite` screenshot.

Fix:

- edge styling is scoped to `.architecture-map__canvas > svg`;
- each node now has an explicit icon/label hierarchy;
- `.architecture-node__icon > svg` is statically positioned at 13×13 px with `fill:none` and the muted accent token;
- selected state uses the existing green border/glow, not icon scale;
- a single-node map uses a shorter centered canvas;
- keyboard focus has a visible accent outline;
- focused graph nodes come only from changed, direct, and one-hop impact IDs, capped at seven.

Browser measurement after the fix: every rendered node icon is exactly 13×13 px, `position: static`, and `rgb(93, 145, 255)`, never pure white. Unit and E2E regression tests assert the direct graph SVG versus nested node SVG relationship and rendered dimensions.

Screenshots:

- `screenshots/architecture-context-after.png`
- `screenshots/repository-architecture.png`
- original before-state supplied by the user: oversized white icon in the `facebook/zstd` Test Suite node.

## Real evidence

Snow Devil demo qualification now produces a ready 17-file repository snapshot with four visible components (Repository Root, App, Palette, Styles), one base dependency, 100% repository mapping, and a patch-backed App → Palette dependency. Repository Root appears as a direct dependent of App through the base import graph. The PR Inspector selects App and shows its root, changed file, confidence, and dependent.

Live GitHub qualification for `facebook/zstd` PR #4675 used base `5233c58e6ca0b1c4c6b353ad79649191ed195bdc`. GitHub reports 658 blobs, 275 C/C++ source/header files, 47 structural/build files, and a non-truncated tree. The PR changes `lib/compress/zstdmt_compress.h` (+2/−2) and `tests/fuzzer.c` (+13). No CODEOWNERS file exists, so the truthful owner result is `Not available`.

The C/C++ fixture derived from that layout maps the changes to Library Core and Test Suite, resolves Test Suite → Library Core from quoted local include evidence in `tests/fuzzer.c`, ignores `<stdio.h>`, reports the base edge as `Existing dependency touched`, and includes both components/direct dependents in blast radius. This replaces the previous changed-file-only result of one Test Suite component, zero dependencies, and 37% confidence.

## Performance and request counts

Real `facebook/zstd` remote input acquisition:

- duration: 17,067 ms on the qualification run;
- GitHub requests: 7 (one recursive tree + six batched content requests);
- retained tree files after default exclusions: 577;
- retrieved analyzable content files: 305;
- retrieved source/build evidence: 5,627,688 bytes;
- truncated: false; warnings: zero.

Exact cached repository load: zero GitHub requests. Synthetic cache JSON deserialization measured 1.08 ms.

Synthetic 1,201-file C/C++ analysis:

- repository inference: 220.41 ms;
- PR impact: 1.44 ms;
- serialized snapshot: 364,039 bytes;
- graph model: 3 components / 1 dependency; visible graph cap: 3 of maximum 7.

Incremental refresh deliberately falls back to a full exact-commit rebuild when the cache entry is removed or the commit changes; its maximum request budget is therefore the same 7 requests. This is safer than partial structural invalidation. CI component lookup is not added in this pass and makes no architecture request.

The existing desktop E2E performance check remains at a 29.6 ms warm-tab median and 3.3 ms menu median. Architecture lists are bounded, graphs cap visible nodes, TanStack queries have 30-minute garbage collection, and cleared tab state does not accumulate after repeated PR/repository switching.

## Verification

- TypeScript: pass
- unit/component tests: 91 files, 418 tests passed
- Rust: 69 tests passed
- production build: pass
- lint: no errors; the repository's existing 52 React hook warnings remain
- Architecture E2E: 2/2 passed
- full E2E: 49 passed, one soak test intentionally skipped
- Cargo check/test: pass
- Rust formatting: pass after `cargo fmt`
- `git diff --check`: pass apart from Git's existing CRLF normalization notices

## Limitations

This is deterministic bounded architecture inference, not universal program understanding.

- Absolute/complex TS aliases, macro-expanded Rust modules, dynamic Python imports, generated build graphs, conditional Make logic, advanced Bazel macros, and non-literal includes may remain unresolved.
- CMake link inference only creates edges when a token safely matches an identified component; it does not execute CMake.
- CODEOWNERS supports normal ordered patterns but not every exotic escaping edge case.
- Content enrichment is capped at 360 files, so very large repositories can be partial even when the Git tree itself is complete.
- Fork permissions, missing patches, inaccessible blobs, submodules, and GitHub truncation reduce completeness and confidence.
- Refresh currently performs a safe full rebuild instead of structural incremental mutation.
- CI, Flow, Delivery Risks, and Home architecture consumers remain deferred; the shared snapshot engine and IDs are now available for those later adapters, and no placeholder inference was added to them.
