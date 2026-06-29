import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '../app/providers';
import { DemoDataProvider } from '../data/demo-provider';
import { useAuthStore } from '../stores/auth-store';
import { useFlowStore } from '../stores/flow-store';
import { useModeStore } from '../stores/mode-store';

const OWNED_KEYS = ['github-graph-browser-tabs', 'snow-devil-mode', 'snow-devil-demo-state', 'snow-devil-theme', 'snow-devil-layout', 'snow-devil-explorer-state', 'snow-devil-saved-views', 'snow-devil-repository-searches', 'snow-devil-notifications', 'snow-devil-history-views'];

export async function resetLocalAppData() {
  await invoke('reset_local_app_data');
  OWNED_KEYS.forEach(key => localStorage.removeItem(key));
  sessionStorage.clear();
  if ('indexedDB' in window) indexedDB.databases?.().then(dbs => dbs.forEach(db => db.name && indexedDB.deleteDatabase(db.name)));
  if ('serviceWorker' in navigator) (await navigator.serviceWorker.getRegistrations()).forEach(registration => registration.unregister());
  DemoDataProvider.clear();
  queryClient.clear();
  useFlowStore.setState({ states: {} });
  useModeStore.setState({ mode: 'live', demoRevision: 0 });
  useAuthStore.setState({ session: { status: 'disconnected' }, isAuthenticated: false, isConnecting: false, deviceCode: null, userCode: null, verificationUri: null, pollError: null });
  window.location.reload();
}
