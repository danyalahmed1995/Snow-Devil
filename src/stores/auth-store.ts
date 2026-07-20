import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { queryClient } from '../app/providers';
import { useTabsStore } from './tabs-store';
import { useFlowStore } from './flow-store';
import { useHistoryViewStore } from './history-view-store';

export type ConnectedAccount = {
  login: string;
  name: string;
  avatarUrl: string;
  bio?: string;
  url?: string;
  repositories?: { totalCount: number };
  organizations?: { totalCount: number; publicCount?: number; privateCount?: number; source?: string; status?: 'ready' | 'partial' | 'unavailable'; errorCode?: 'missing_read_org' | 'sso_required' | 'organization_access_restricted' | 'unavailable'; message?: string; nodes?: Array<{ id: number; login: string; avatarUrl?: string; url?: string; role?: string; state?: string; visibility?: 'public' | 'private' }> };
  pullRequests?: { totalCount: number };
  issues?: { totalCount: number };
};

export type AuthenticatedSession =
  | { status: "checking" }
  | { status: "disconnected" }
  | { status: "connected"; account: ConnectedAccount }
  | { status: "error"; message: string; kind?: "expired" | "offline" | "rate_limited" | "unknown" };

interface AuthState {
  session: AuthenticatedSession;
  isAuthenticated: boolean; // Computed for ease of use
  isConnecting: boolean;
  deviceCode: string | null;
  userCode: string | null;
  verificationUri: string | null;
  clientId: string;
  pollError: string | null;
  showAuthModal: boolean;
  setClientId: (id: string) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  checkAuthStatus: () => Promise<void>;
  startDeviceFlow: () => Promise<void>;
  manualPoll: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const DEFAULT_CLIENT_ID = localStorage.getItem('github_client_id') || '';

export const useAuthStore = create<AuthState>((set, get) => ({
  session: { status: "checking" },
  isAuthenticated: false,
  isConnecting: false,
  deviceCode: null,
  userCode: null,
  verificationUri: null,
  clientId: DEFAULT_CLIENT_ID,
  pollError: null,
  showAuthModal: false,

  openAuthModal: () => set({ showAuthModal: true }),
  closeAuthModal: () => {
    set({ showAuthModal: false });
    if (get().isConnecting) {
      set({ isConnecting: false });
    }
  },

  setClientId: (id: string) => {
    localStorage.setItem('github_client_id', id);
    set({ clientId: id });
  },

  checkAuthStatus: async () => {
    const previousSession = get().session;
    const previousLogin = previousSession.status === 'connected' ? previousSession.account.login : undefined;
    set({ session: { status: "checking" } });
    try {
      const res = await invoke<any>('get_auth_status');
      if (res.isAuthenticated && res.account) {
        if (previousLogin && previousLogin.toLowerCase() !== String(res.account.login).toLowerCase()) {
          queryClient.clear();
          useFlowStore.setState({ states: {} });
          useHistoryViewStore.setState({ states: {} });
        }
        set({ 
          session: { status: "connected", account: res.account },
          isAuthenticated: true
        });
        await queryClient.invalidateQueries({ queryKey: ['account-context'] });
      } else {
        set({ session: { status: "disconnected" }, isAuthenticated: false });
      }
    } catch (e: any) {
      console.error('Failed to get auth status:', e);
      const raw=e.toString();
      const kind=raw.includes('401')||raw.toLowerCase().includes('auth')?'expired':raw.toLowerCase().includes('rate')?'rate_limited':raw.toLowerCase().includes('network')||raw.toLowerCase().includes('offline')||raw.toLowerCase().includes('fetch')?'offline':'unknown';
      const message=kind==='expired'?'Your GitHub connection expired. Reconnect to continue.':kind==='rate_limited'?'GitHub rate limit reached. Cached data remains available.':kind==='offline'?'GitHub is unreachable. Cached data remains available where possible.':'Snow Devil could not verify this GitHub account.';
      set({ 
        session: { status: "error", message, kind },
        isAuthenticated: false
      });
    }
  },

  manualPoll: async () => {
    const { clientId, deviceCode, isConnecting } = get();
    if (!isConnecting || !deviceCode) return;
    
    try {
      set({ pollError: null });
      const pollRes = await invoke<string | null>('poll_github_device_flow', { clientId, deviceCode });
      
      if (pollRes) {
        // Now fetch account details
        await get().checkAuthStatus();
        set({ 
          isConnecting: false,
          deviceCode: null,
          userCode: null,
          verificationUri: null,
          pollError: null
        });
      } else {
        set({ pollError: "Authorization still pending. Make sure you clicked 'Authorize' on GitHub." });
      }
    } catch (e: any) {
      console.error('Manual polling error:', e);
      set({ pollError: e.toString() });
    }
  },

  startDeviceFlow: async () => {
    const { clientId } = get();
    if (!clientId) return;
    
    set({ isConnecting: true, pollError: null });
    try {
      const res = await invoke<any>('start_github_device_flow', { clientId });
      set({
        deviceCode: res.device_code,
        userCode: res.user_code,
        verificationUri: res.verification_uri
      });

      let isPolling = true;
      let currentInterval = (res.interval || 5) * 1000;

      const poll = async () => {
        try {
          const { deviceCode, isConnecting } = get();
          if (!isConnecting || !deviceCode) {
            isPolling = false;
            return;
          }
          
          const pollRes = await invoke<string | null>('poll_github_device_flow', { clientId, deviceCode });
          if (pollRes) {
            isPolling = false;
            await get().checkAuthStatus();
            set({ 
              isConnecting: false,
              deviceCode: null,
              userCode: null,
              verificationUri: null,
              pollError: null
            });
            return;
          }
        } catch (e: any) {
          const errStr = e.toString();
          if (errStr.includes('slow_down')) {
            const match = errStr.match(/slow_down:(\d+)/);
            currentInterval = match ? parseInt(match[1], 10) * 1000 : currentInterval + 5000;
            set({ pollError: `Rate limit handling: waiting ${currentInterval/1000}s...` });
          } else {
            set({ pollError: errStr });
          }
        }
        
        if (isPolling) setTimeout(poll, currentInterval);
      };

      setTimeout(poll, currentInterval);
    } catch (e: any) {
      set({ isConnecting: false, pollError: e.toString() });
    }
  },

  disconnect: async () => {
    try {
      await invoke('disconnect_github_account');
      await import('../browser/browser-commands').then(({ browserClearData }) => Promise.all(useTabsStore.getState().tabs.filter(tab=>tab.family==='browser').map(tab=>browserClearData(tab.id)))).catch(() => undefined);
      queryClient.clear();
      useFlowStore.setState({ states: {} });
      useHistoryViewStore.setState({ states: {} });
      const now=Date.now();
      useTabsStore.setState({ tabs:[{id:'native:home',family:'native',kind:'home',title:'Home',pinned:true,closable:false,createdAt:now,lastActivatedAt:now}],activeTabId:'native:home',navigationGeneration:useTabsStore.getState().navigationGeneration+1 });
      set({ session: { status: "disconnected" }, isAuthenticated: false });
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  }
}));
