import { createContext, useContext, type ReactNode } from 'react';
import { useTabsStore } from '../../stores/tabs-store';

const TabInstanceContext = createContext<string | undefined>(undefined);

export function TabInstanceProvider({ tabId, children }: { tabId: string; children: ReactNode }) {
  return <TabInstanceContext.Provider value={tabId}>{children}</TabInstanceContext.Provider>;
}

export function useCurrentTabId(): string {
  const instanceId = useContext(TabInstanceContext);
  const activeTabId = useTabsStore(state => state.activeTabId);
  return instanceId ?? activeTabId;
}
