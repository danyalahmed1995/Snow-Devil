//! Browser module – manages child webviews that render GitHub pages.
//!
//! Sub-modules:
//! - `models`     – request/response and event types
//! - `security`   – URL validation and navigation policy
//! - `navigation` – URL normalization and tab identity
//! - `manager`    – in-memory tab bookkeeping (pure logic, no Tauri dependency)
//! - `commands`   – `#[tauri::command]` handlers wired into the invoke router

pub mod commands;
pub mod manager;
pub mod models;
pub mod navigation;
pub mod security;
