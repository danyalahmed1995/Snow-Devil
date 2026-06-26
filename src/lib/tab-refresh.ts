import type { WorkspaceTab } from "../stores/tabs-store";
import { isBrowserTab } from "../stores/tabs-store";
import { browserReload } from "../browser/browser-commands";

export interface TabRefreshRegistration {
  label?: string;
  disabledReason?: string;
  refresh: () => void | Promise<void>;
}

export interface TabRefreshCapability {
  available: boolean;
  label: string;
  disabledReason?: string;
}

const registrations = new Map<string, TabRefreshRegistration>();

export function registerTabRefresh(tabId: string, registration: TabRefreshRegistration): () => void {
  registrations.set(tabId, registration);
  return () => {
    if (registrations.get(tabId) === registration) registrations.delete(tabId);
  };
}

export function clearTabRefreshRegistrationsForTests(): void {
  registrations.clear();
}

export function tabRefreshCapability(tab: WorkspaceTab | undefined): TabRefreshCapability {
  if (!tab) return { available: false, label: "Refresh tab", disabledReason: "No tab is selected." };
  if (isBrowserTab(tab)) return { available: true, label: "Refresh tab" };
  const registration = registrations.get(tab.id);
  if (!registration) return { available: false, label: "Refresh tab", disabledReason: "This tab does not expose a refresh action." };
  if (registration.disabledReason) return { available: false, label: registration.label ?? "Refresh tab", disabledReason: registration.disabledReason };
  return { available: true, label: registration.label ?? "Refresh tab" };
}

export async function refreshWorkspaceTab(tab: WorkspaceTab): Promise<void> {
  if (isBrowserTab(tab)) {
    await browserReload(tab.id);
    return;
  }
  const registration = registrations.get(tab.id);
  if (!registration || registration.disabledReason) {
    throw new Error(registration?.disabledReason ?? "This tab does not expose a refresh action.");
  }
  await registration.refresh();
}
