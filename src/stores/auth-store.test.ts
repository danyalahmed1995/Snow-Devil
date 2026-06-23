import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from './tabs-store';

describe('Auth Store', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: { status: 'checking' } });
    vi.clearAllMocks();
  });

  it('hydrates session successfully', async () => {
    (invoke as any).mockResolvedValueOnce({ isAuthenticated: true, account: { login: 'testuser' } });
    await useAuthStore.getState().checkAuthStatus();
    const state = useAuthStore.getState();
    expect(state.session.status).toBe('connected');
    if (state.session.status === 'connected') {
      expect(state.session.account.login).toBe('testuser');
    }
  });

  it('handles account loading error', async () => {
    (invoke as any).mockRejectedValueOnce(new Error('Network error'));
    
    await useAuthStore.getState().checkAuthStatus();
    const state = useAuthStore.getState();
    expect(state.session.status).toBe('error');
    if (state.session.status === 'error') {
      expect(state.session.kind).toBe('offline');
      expect(state.session.message).toContain('Cached data');
    }
  });

  it('handles disconnected state', async () => {
    (invoke as any).mockResolvedValueOnce({ isAuthenticated: false });
    
    await useAuthStore.getState().checkAuthStatus();
    expect(useAuthStore.getState().session.status).toBe('disconnected');
  });

  it('sign-out removes account-scoped tabs before private content can remain visible', async () => {
    const now=Date.now();
    useTabsStore.setState({tabs:[{id:'native:home',family:'native',kind:'home',title:'Home',pinned:true,closable:false,createdAt:now,lastActivatedAt:now},{id:'private',family:'browser',kind:'repository',title:'Private repo',currentUrl:'https://github.com/private/repo',history:['https://github.com/private/repo'],historyIndex:0,lifecycle:'resident',pinned:false,closable:true,createdAt:now,lastActivatedAt:now}],activeTabId:'private'});
    (invoke as any).mockResolvedValue(undefined);
    await useAuthStore.getState().disconnect();
    expect(useTabsStore.getState().tabs.map(tab=>tab.id)).toEqual(['native:home']);
    expect(useAuthStore.getState().session.status).toBe('disconnected');
  });
});
