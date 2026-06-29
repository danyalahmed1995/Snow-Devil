# Demo Mode and Local Reset

## Persistence and reset scope

Snow Devil stores its OAuth access token in the operating-system credential store under service `github-graph-browser`, account `github-oauth-token`. There is no refresh token. GitHub-derived records are stored in `app.db` in the Tauri application data directory: `accounts`, `nodes`, `edges`, `notifications`, `timeline_events`, `sync_state`, `tabs`, `navigation_history`, `saved_views`, `simulator_entities`, `simulator_events`, and `simulator_sync_state`. The frontend persists restored tabs in localStorage key `github-graph-browser-tabs`; it also owns `snow-devil-mode`, `snow-devil-demo-state`, and the optional `github_client_id`. Flow and inspector selections are in memory. React Query holds API responses in memory. Tauri child webviews hold GitHub cookies, cache, history, and site storage in Snow Devil's WebView2 profile.

`reset_local_app_data` is the canonical backend reset. The frontend `resetLocalAppData` wrapper invokes it, removes Snow Devil-owned storage and service workers, resets stores and query caches, then reloads. It is safe to call repeatedly. The reset preserves the `settings` table, theme and other non-user preferences, and source-controlled `public/demo-data` fixtures.

The reset never calls GitHub, revokes OAuth authorization, clears other credential-store entries, or touches Chrome, Firefox, Edge, or another external browser profile.

## Demo Mode

Choose **Explore Demo** while signed out. A visible Demo Mode badge remains in the header. Demo Mode uses the typed `DemoDataProvider` boundary and loads only `/demo-data/*.json`; it never falls back from live requests and never writes fixtures to SQLite or live caches. Choose **Exit Demo** to return to the signed-out state. **Reset Demo** clears selections and restores the manifest's deterministic reference date.

Fixtures are rooted at `public/demo-data/manifest.json`. Account, home, flow, simulator, and repository files use stable IDs and ISO dates relative to `2026-02-15T12:00:00Z`. To add a scenario, update the relevant fixture, its relationship in the manifest, and the schema/coverage tests.

Run validation with `pnpm test`, `pnpm build`, `pnpm lint`, `cargo test`, `cargo check`, and `git diff --check`.
