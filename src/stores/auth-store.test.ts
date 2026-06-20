import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth-store';
import { invoke } from '@tauri-apps/api/core';

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
      expect(state.session.message).toContain('Network error');
    }
  });

  it('handles disconnected state', async () => {
    (invoke as any).mockResolvedValueOnce({ isAuthenticated: false });
    
    await useAuthStore.getState().checkAuthStatus();
    expect(useAuthStore.getState().session.status).toBe('disconnected');
  });
});
