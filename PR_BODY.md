## Summary

- centralize context-aware work-item open actions and destination labels
- open pull requests and CI runs in their existing native Snow Devil viewers
- open issues in Snow Devil's embedded app browser until a native issue viewer exists
- preserve `Open in Flow` outside Flow and suppress it while already inside Flow
- align Inspector actions with context actions first and the primary action anchored at the bottom

## What changed

### Centralized action resolution

- Added a typed resolver for pull requests, issues, and CI runs.
- Defined deterministic primary and secondary action ordering.
- Added clear disabled states when a repository identity, item number, run ID, or canonical URL is unavailable.
- Centralized destination labels:
  - `Open PR`
  - `Open CI Run`
  - `Open in App Browser`
  - `Open in Flow`
  - `Open on GitHub`
  - `Copy Link`

### Native and browser routing

- Pull requests now open in the native PR diff viewer by default.
- CI runs now open in the native CI run viewer by default.
- Issues open in Snow Devil's embedded browser and never route to the PR viewer.
- Existing canonical tab identities are reused so repeated actions focus an existing destination instead of opening duplicates.
- External GitHub and copy-link actions remain available when a canonical URL exists.

### Flow behavior

- `Open in Flow` is available from Home and other non-Flow Inspector surfaces.
- `Open in Flow` is omitted inside Flow to avoid circular navigation.
- Flow routing preserves the selected item, stage, pending scroll target, and source context when the item is available.
- When only partial item context is available, Flow remains open and reports that refreshing or broadening filters may be required.

### Shared UI and migrated surfaces

- Added a reusable `WorkItemOpenActions` group.
- Migrated the Inspector, Home cards, Flow cards, pull-request lists, issue lists, simulator selections, and supported analytics selections.
- Restored the established Inspector action hierarchy:
  - context actions first
  - browser and copy actions in the middle
  - prominent primary action at the bottom
- Kept PR and CI action rows balanced when the additional app-browser action is present.

## Testing

- `pnpm test` — 450 passed
- focused resolver and Inspector tests — 15 passed
- `pnpm test:e2e -- --reporter=list` — 49 passed, 1 skipped
- `cargo check --manifest-path src-tauri/Cargo.toml` — passed
- `cargo test --manifest-path src-tauri/Cargo.toml` — 69 passed
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` — passed
- `git diff --check` — passed

## Known pre-existing issues

- `pnpm exec tsc --noEmit`, `pnpm build`, and `pnpm run lint` remain blocked by the pre-existing unused `Snowflake` import in `src/components/layout/TopBar.tsx`.
- Lint also reports existing warnings outside the scope of this change.

## Limitations

- Snow Devil still does not have a native issue viewer; issues intentionally use the embedded app browser.
- Real connected-data qualification and app-restart restoration were not performed as part of automated verification.

