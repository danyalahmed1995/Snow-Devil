# ❄️ Snow-Devil (GitHub Graph Browser)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-v19-%2361DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-black?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![CI](https://github.com/martian7777/Snow-Devil/actions/workflows/ci.yml/badge.svg)](https://github.com/martian7777/Snow-Devil/actions/workflows/ci.yml)
[![Release](https://github.com/martian7777/Snow-Devil/actions/workflows/release.yml/badge.svg)](https://github.com/martian7777/Snow-Devil/actions/workflows/release.yml)

**Snow-Devil** is a premium, developer-first desktop Hub designed to streamline GitHub workflow visualization and team collaboration. Inspired by the philosophy of **Mainline.dev**, Snow-Devil acts as a single pane of glass for your active pull requests, issues, and team workspaces.

Built with **Tauri v2**, **React 19**, and **Rust**, it combines native performance, secure local database caching, and a premium glassmorphic user interface with an integrated browser engine for instant workspace context switching.

---

## ✨ Key Features

### 📋 Account Flow & Pipeline
Visual, kanban-like horizontal workbench split into developer lifecycle stages:
- **Stages**: `Issues` ➜ `Coding` ➜ `Pull Requests` ➜ `Review` ➜ `Checks` ➜ `Ready` ➜ `Merged` ➜ `Released`
- **Attention Metrics**: Instant visibility into items needing attention, waiting reviews, failing checks, and recently merged pull requests.

### 👥 Team Workspaces & Collaboration (Mainline-inspired)
Transition from isolated views to active team collaboration:
- **Nothing is Hidden**: Shared visual awareness across organization members.
- **TeamTreeView**: Collapsible tree navigation showing Org ➔ Member ➔ Active work (lazy-loaded with a 5-minute cache).
- **Co-collaborator Avatars**: Pull request nodes display overlapping avatar chips for reviewers, assignees, and authors.
- **Teamwork Dashboard**: A full-page, glassmorphism-styled dashboard that aggregates active work (PRs authored, review requests, and assigned issues) for all team members in a responsive card grid.

### 🌐 Embedded Browser Tab System
Manage tabs directly inside the Tauri application:
- Dual modes: view details or open in the integrated webview tab list.
- Features standard navigation (back, forward, refresh, focus) and performance management (webview suspension, caching).

---

## 🛠️ Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Core Architecture** | [Tauri v2](https://tauri.app/) | High-performance, secure cross-platform desktop framework. |
| **Frontend UI** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) | Type-safe, component-driven reactive user interface. |
| **State Management** | [Zustand](https://github.com/pmndrs/zustand) | Ultra-lightweight, reactive state store for UI and team status. |
| **Data Fetching** | [React Query](https://tanstack.com/query) | Hook-based caching and data synchronization layer. |
| **Backend & Sync** | [Rust](https://www.rust-lang.org/), [reqwest](https://github.com/seanmonstar/reqwest) | Fast, concurrent operations, GraphQL API batch querying, and OAuth handling. |
| **Local Cache** | [SQLite](https://sqlite.org/) | Local database for storing git graphs and repository snapshots. |
| **Styling** | Vanilla CSS + CSS Variables | Premium glassmorphism design language with customizable tokens. |

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed:
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (1.80+)
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v9+)
- C++ Build Tools (on Windows, via Visual Studio Build Tools)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/martian7777/Snow-Devil.git
   cd Snow-Devil
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Development
Start the application in Tauri development mode:
```bash
pnpm tauri dev
```
This runs the Vite development server in the background and launches the Tauri desktop client.

### Building for Release
Compile the optimized production bundle and installer:
```bash
pnpm tauri build
```

---

## 🔑 GitHub OAuth Configuration

To connect Snow-Devil to your GitHub account:
1. Register a new **OAuth Application** on GitHub:
   - Go to: `Settings` ➔ `Developer settings` ➔ `OAuth Apps` ➔ `New OAuth App`.
   - Set the authorization callback URL according to the Tauri client's listener (integrated device flow).
2. The Tauri client implements the **Device Flow** for secure, passwordless authentication:
   - Initiates a verification code.
   - Prompts the user to authorize via their browser.
   - Saves the OAuth token securely using OS-level credentials store.

> [!NOTE]
> The app requests the `read:org` and `repo` scopes to display organization team members and fetch public/private repository details.

---

## 📁 Project Directory Structure

```
Snow-Devil/
├── src-tauri/                 # Rust Backend (Tauri Host)
│   ├── src/
│   │   ├── auth/              # GitHub OAuth device flow & token store
│   │   ├── browser/           # Built-in webview manager & commands
│   │   ├── commands/          # Tauri command handlers (auth, db, team, flow)
│   │   ├── db/                # SQLite setup and connection state
│   │   ├── github/            # reqwest-based GitHub GraphQL API and models
│   │   └── lib.rs             # Tauri app setup and command registration
│   └── Cargo.toml
├── src/                       # React Frontend
│   ├── app/                   # Providers & Entry points
│   ├── browser/               # Webview event handlers and URL classifiers
│   ├── components/            # UI Components
│   │   ├── layout/            # Sidebar, Inspector, and Navigation layouts
│   │   ├── navigator/         # TeamTreeView and Navigation sidebar
│   │   └── workspace/         # Flow workbench, Dashboard, TeamworkView
│   ├── stores/                # Zustand Stores (auth, tabs, team, layout)
│   ├── styles/                # CSS styling, tokens, and glassmorphic designs
│   └── main.tsx
├── package.json
└── vite.config.ts
```

---

## 🧪 Testing

Snow-Devil includes both unit tests and end-to-end integration tests:

- **Frontend Unit Tests**: Run tests with Vitest:
  ```bash
  pnpm test
  ```
- **E2E Integration Tests**: Run browser-based Playwright E2E tests:
  ```bash
  pnpm test:e2e
  ```
- **Linter**: Ensure code formatting and quality:
  ```bash
  pnpm lint
  ```

---

## 🔄 CI/CD Pipeline

The project uses GitHub Actions to automate code quality checks and application delivery.

### 🧪 Continuous Integration (CI)
Every pull request or commit pushed to the main branches (`main` or `master`) triggers the CI workflow (`.github/workflows/ci.yml`), which performs the following tasks:
- **Frontend Checks**: Automatically sets up Node.js, runs `pnpm install`, lints the codebase (`pnpm lint`), and runs unit tests (`pnpm test`).
- **Rust Backend Checks**: Automatically sets up the Rust stable toolchain, installs target-specific dependencies, checks formatting (`cargo fmt`), runs compiler validation (`cargo check`), and validates code quality using Clippy (`cargo clippy`).

### 📦 Continuous Delivery (CD)
When a release tag matching `v*` (e.g., `v1.0.0`) is pushed, the CD workflow (`.github/workflows/release.yml`) builds native binaries for all three major platforms:
- **Windows**: Produces `.msi` installers and setup files.
- **macOS**: Produces `.dmg` packages and application bundles.
- **Linux**: Produces `.deb` and AppImage packages.

All compiled artifacts are uploaded automatically to a new **draft release** on GitHub, making distribution and updates seamless.

---

## 📄 License
This project is licensed under the MIT License. See the [LICENSE](file:///d:/snow-devil/Snow-Devil/LICENSE) file for details.
