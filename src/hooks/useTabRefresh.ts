import { useEffect } from "react";
import { registerTabRefresh, type TabRefreshRegistration } from "../lib/tab-refresh";

export function useTabRefresh(tabId: string, registration: TabRefreshRegistration): void {
  useEffect(() => registerTabRefresh(tabId, registration), [tabId, registration]);
}
