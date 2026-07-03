import { invoke } from '@tauri-apps/api/core';

export interface UpdateSummary {
  version: string;
  currentVersion: string;
  notes?: string | null;
}

/** Check the release endpoint for a newer signed build; null when up to date. */
export function checkForUpdate(): Promise<UpdateSummary | null> {
  return invoke<UpdateSummary | null>('check_for_update');
}

/** Download, verify, install the available update, and relaunch the app. */
export function installUpdate(): Promise<void> {
  return invoke<void>('install_update');
}
