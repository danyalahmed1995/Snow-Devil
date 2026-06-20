import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export type ConnectedAccount = {
  login: string;
  name: string;
  avatarUrl: string;
  bio?: string;
  url?: string;
  repositories?: { totalCount: number };
  organizations?: { totalCount: number };
  pullRequests?: { totalCount: number };
  issues?: { totalCount: number };
};

export type AuthenticatedSession =
  | { status: "checking" }
  | { status: "disconnected" }
  | { status: "connected"; account: ConnectedAccount }
  | { status: "error"; message: string };

interface AuthState {
  session: AuthenticatedSession;
  isAuthenticated: boolean; // Computed for ease of use
  isConnecting: boolean;
  deviceCode: string | null;
  userCode: string | null;
  verificationUri: string | null;
  clientId: string;
  pollError: string | null;
  setClientId: (id: string) => void;
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

  setClientId: (id: string) => {
    localStorage.setItem('github_client_id', id);
    set({ clientId: id });
  },

  checkAuthStatus: async () => {
    set({ session: { status: "checking" } });
    try {
      const res = await invoke<any>('get_auth_status');
      if (res.isAuthenticated && res.account) {
        set({ 
          session: { status: "connected", account: res.account },
          isAuthenticated: true
        });
      } else {
        set({ session: { status: "disconnected" }, isAuthenticated: false });
      }
    } catch (e: any) {
      console.error('Failed to get auth status:', e);
      set({ 
        session: { status: "error", message: e.toString() },
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
        set({ 
          isConnecting: false,
          deviceCode: null,
          userCode: null,
          verificationUri: null,
          pollError: null
        });
        // Now fetch account details
        await get().checkAuthStatus();
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
            set({ 
              isConnecting: false,
              deviceCode: null,
              userCode: null,
              verificationUri: null,
              pollError: null
            });
            await get().checkAuthStatus();
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
      set({ session: { status: "disconnected" }, isAuthenticated: false });
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  }
}));
